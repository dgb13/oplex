import forge from 'node-forge';
import { XMLParser } from 'fast-xml-parser';

export interface WsaaTicket {
  token: string;
  sign: string;
  expiresAt: Date;
}

/** Dónde guardar los tickets entre llamadas. WSAA los da por ~12 h y
 * rechaza pedir otro mientras uno siga vigente
 * ("coe.alreadyAuthenticated"), así que el cache en memoria de una sola
 * instancia no alcanza: cada venta crea un cliente nuevo y un reinicio de
 * la API los pierde. AfipCredentialsService provee uno respaldado en la
 * base (cifrado). */
export interface WsaaTicketStore {
  load(service: string): Promise<WsaaTicket | null>;
  save(service: string, ticket: WsaaTicket): Promise<void>;
}

export interface AfipWsaaCredentials {
  certPem: string;
  keyPem: string;
  env: 'homologacion' | 'produccion';
  ticketStore?: WsaaTicketStore;
}

const WSAA_URL: Record<AfipWsaaCredentials['env'], string> = {
  homologacion: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  produccion: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
};

const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

/**
 * AFIP's WSAA (Web Service de Autenticación y Autorización): every other
 * AFIP web service (padrón, WSFE, ...) needs a token+sign pair from here
 * first, obtained by CMS-signing a short-lived XML request with the
 * tenant's own AFIP certificate/key. Tickets are valid ~12h and AFIP asks
 * integrators not to request a new one on every call, hence the cache.
 *
 * Lives in this shared lib (not inside companies, where it originated)
 * because both the padrón lookup (companies) and WSFE (invoicing) need the
 * exact same auth mechanism against different, separately-authorized AFIP
 * services - see AfipCredentialsService's docstring for why credentials
 * themselves are resolved per-call rather than baked into either module.
 */
export class AfipWsaaClient {
  private readonly ticketCache = new Map<string, WsaaTicket>();

  constructor(private readonly credentials: AfipWsaaCredentials) {}

  async getTicket(service: string): Promise<WsaaTicket> {
    // Refreshed 5 minutes before expiry rather than exactly at expiry, so
    // an in-flight request doesn't race the ticket going stale mid-call.
    const fresh = (t: WsaaTicket | null | undefined): t is WsaaTicket =>
      !!t && t.expiresAt.getTime() - Date.now() > 5 * 60_000;
    const cached = this.ticketCache.get(service);
    if (fresh(cached)) {
      return cached;
    }
    const stored = await this.credentials.ticketStore?.load(service);
    if (fresh(stored)) {
      this.ticketCache.set(service, stored);
      return stored;
    }

    const cms = this.signLoginRequest(service);
    const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

    const response = await fetch(WSAA_URL[this.credentials.env], {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
      body: soapBody,
    });
    const responseText = await response.text();
    if (!response.ok) {
      const fault = this.describeFault(responseText);
      if (fault.includes('alreadyAuthenticated')) {
        // Hay un ticket vigente que no tenemos guardado (pedido antes de
        // que existiera el ticketStore, o desde otro sistema con el mismo
        // certificado) - no queda otra que esperar a que venza.
        throw new Error(
          `ARCA ya entregó un ticket de acceso vigente para este certificado que Oplex no tiene guardado. Vence solo en unas horas (máximo 12); después de eso se normaliza. Detalle: ${fault}`,
        );
      }
      throw new Error(`ARCA WSAA rechazó la solicitud: ${fault}`);
    }

    const envelope = xmlParser.parse(responseText);
    const loginCmsReturn: string | undefined =
      envelope?.Envelope?.Body?.loginCmsResponse?.loginCmsReturn;
    if (!loginCmsReturn) {
      throw new Error(`Respuesta de ARCA WSAA sin loginCmsReturn: ${responseText.slice(0, 300)}`);
    }

    const ticketXml = xmlParser.parse(loginCmsReturn);
    const header = ticketXml?.loginTicketResponse?.header;
    const ticketCredentials = ticketXml?.loginTicketResponse?.credentials;
    if (!header?.expirationTime || !ticketCredentials?.token || !ticketCredentials?.sign) {
      throw new Error(`No se pudo leer el ticket de ARCA WSAA: ${loginCmsReturn.slice(0, 300)}`);
    }

    const ticket: WsaaTicket = {
      token: ticketCredentials.token,
      sign: ticketCredentials.sign,
      expiresAt: new Date(header.expirationTime),
    };
    this.ticketCache.set(service, ticket);
    await this.credentials.ticketStore?.save(service, ticket);
    return ticket;
  }

  /** CMS/PKCS#7-signs the loginTicketRequest AFIP expects - the Node
   * equivalent of `openssl smime -sign`, done with node-forge instead of
   * shelling out so this works the same on any host without an openssl
   * binary on PATH. */
  private signLoginRequest(service: string): string {
    const now = new Date();
    const generationTime = new Date(now.getTime() - 10 * 60_000);
    const expirationTime = new Date(now.getTime() + 10 * 60_000);

    const loginTicketRequest = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(now.getTime() / 1000)}</uniqueId>
    <generationTime>${generationTime.toISOString()}</generationTime>
    <expirationTime>${expirationTime.toISOString()}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`;

    const certificate = forge.pki.certificateFromPem(this.credentials.certPem);
    const privateKey = forge.pki.privateKeyFromPem(this.credentials.keyPem);

    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(loginTicketRequest, 'utf8');
    p7.addCertificate(certificate);
    p7.addSigner({
      key: privateKey,
      certificate,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
      ],
    });
    p7.sign({ detached: false });

    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    return forge.util.encode64(der);
  }

  /** WSAA reports rejections (cert not trusted/expired, clock skew, wrong
   * environment, ...) as a SOAP <Fault> in the body of a non-2xx response.
   * A raw slice of that body is dominated by envelope/namespace boilerplate
   * and cuts off before the actual faultcode/faultstring - parse it so the
   * real reason surfaces instead of a truncated fragment like "ns1:cms". */
  private describeFault(responseText: string): string {
    try {
      const envelope = xmlParser.parse(responseText);
      const fault = envelope?.Envelope?.Body?.Fault;
      if (fault?.faultstring) {
        return `[${fault.faultcode ?? '?'}] ${fault.faultstring}`;
      }
    } catch {
      // Not parseable XML - fall through to the raw fragment below.
    }
    return responseText.slice(0, 500);
  }
}
