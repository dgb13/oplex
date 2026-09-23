import { Injectable, Logger } from '@nestjs/common';
import { AfipCredentialsService, AfipWsaaClient, type AfipWsaaCredentials } from '@plexo/afip-credentials';
import { XMLParser } from 'fast-xml-parser';
import {
  AfipLookupError,
  AfipNotConfiguredError,
  type AfipPadronData,
  type AfipPadronPort,
} from './afip-padron.port.js';

const PADRON_SERVICE = 'ws_sr_padron_a13';

const PADRON_URL: Record<AfipWsaaCredentials['env'], string> = {
  homologacion: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13',
  produccion: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13',
};

const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

interface AfipImpuesto {
  idImpuesto?: string | number;
  estado?: string;
}

interface AfipPersona {
  tipoPersona?: string;
  razonSocial?: string;
  nombre?: string;
  apellido?: string;
  domicilioFiscal?: { direccion?: string; localidad?: string; provincia?: string };
  datosGenerales?: AfipPersona;
  datosRegimenGeneral?: { impuesto?: AfipImpuesto | AfipImpuesto[] };
  datosMonotributo?: { categoriaMonotributo?: string | { descripcionCategoria?: string } };
}

/**
 * Real ws_sr_padron_a13 lookup. Resolves the CURRENT tenant's AFIP
 * credentials on every call via AfipCredentialsService - same certificate
 * already uploaded in Preferencias for WSFE, same reasoning as
 * RealElectronicInvoicingService (a factory/constructor can't do this once
 * at boot in a multi-tenant app). Replaces the old global
 * AFIP_CERT_PATH/AFIP_KEY_PATH/AFIP_CUIT_REPRESENTADA env vars (one
 * certificate for the whole instance, incompatible with multi-tenant) - see
 * companies.module.ts.
 */
@Injectable()
export class RealAfipPadronService implements AfipPadronPort {
  private readonly logger = new Logger(RealAfipPadronService.name);

  constructor(private readonly afipCredentials: AfipCredentialsService) {}

  /** Throws AfipNotConfiguredError (not null) when this tenant hasn't
   * uploaded a certificate yet - same convention as the old
   * StubAfipPadronService, which CompaniesService.lookupAfip already
   * translates to a 400 ("no configurada"), distinct from an AfipLookupError
   * (502, AFIP itself failing). */
  async lookup(cuit: string): Promise<AfipPadronData | null> {
    const credentials = await this.afipCredentials.getCurrent();
    if (!credentials) {
      throw new AfipNotConfiguredError();
    }
    const wsaa = new AfipWsaaClient(credentials);
    const env: AfipWsaaCredentials['env'] = credentials.env;
    const cuitRepresentada = credentials.cuitRepresentada;

    let ticket;
    try {
      ticket = await wsaa.getTicket(PADRON_SERVICE);
    } catch (err) {
      throw new AfipLookupError('No se pudo autenticar contra ARCA (WSAA)', err);
    }

    const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a13="http://a13.soap.ws.server.puc.sr/">
  <soapenv:Header/>
  <soapenv:Body>
    <a13:getPersona>
      <token>${ticket.token}</token>
      <sign>${ticket.sign}</sign>
      <cuitRepresentada>${cuitRepresentada}</cuitRepresentada>
      <idPersona>${cuit}</idPersona>
    </a13:getPersona>
  </soapenv:Body>
</soapenv:Envelope>`;

    let responseText: string;
    try {
      const response = await fetch(PADRON_URL[env], {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
        body: soapBody,
      });
      responseText = await response.text();
      if (!response.ok) {
        throw new Error(`ARCA respondió ${response.status}`);
      }
    } catch (err) {
      throw new AfipLookupError('No se pudo consultar el padrón de ARCA', err);
    }

    const faultMatch = responseText.match(/<faultstring>(.*?)<\/faultstring>/);
    if (faultMatch) {
      // A CUIT with no padrón record surfaces as a SOAP fault too, not
      // just a missing <persona> - treat it the same as "not found".
      if (/no existe|no se encuentra|sin datos/i.test(faultMatch[1])) {
        return null;
      }
      throw new AfipLookupError(faultMatch[1]);
    }

    const parsed = xmlParser.parse(responseText);
    const persona: AfipPersona | undefined =
      parsed?.Envelope?.Body?.getPersonaResponse?.personaReturn?.persona;
    if (!persona) {
      return null;
    }

    this.logger.log(`AFIP padrón lookup for ${cuit} resolved`);
    return this.mapPersona(cuit, persona);
  }

  private mapPersona(cuit: string, persona: AfipPersona): AfipPadronData {
    const general = persona.datosGenerales ?? persona;
    const personType: 'FISICA' | 'JURIDICA' = general.tipoPersona === 'FISICA' ? 'FISICA' : 'JURIDICA';
    const name =
      general.razonSocial || [general.nombre, general.apellido].filter(Boolean).join(' ') || cuit;

    const domicilio = general.domicilioFiscal;
    const fiscalAddress = domicilio
      ? [domicilio.direccion, domicilio.localidad, domicilio.provincia].filter(Boolean).join(', ')
      : '';

    return {
      cuit,
      personType,
      name,
      taxCondition: this.inferTaxCondition(persona),
      fiscalAddress: fiscalAddress || null,
    };
  }

  /** Best-effort label, not a closed enum - AFIP's own tax-condition
   * categories change over time. Persisted in Company.taxCondition and
   * pattern-matched (case-insensitive substring, see
   * apps/web/src/lib/documentLetter.ts) to suggest the invoice letter - not
   * just a display-only string anymore. */
  private inferTaxCondition(persona: AfipPersona): string | null {
    const impuestos = persona.datosRegimenGeneral?.impuesto;
    const list = Array.isArray(impuestos) ? impuestos : impuestos ? [impuestos] : [];
    const ivaInscripto = list.some(
      (imp) => String(imp.idImpuesto) === '30' && imp.estado === 'ACTIVO',
    );
    if (ivaInscripto) {
      return 'Responsable Inscripto';
    }

    const monotributo = persona.datosMonotributo;
    if (monotributo) {
      const categoria =
        typeof monotributo.categoriaMonotributo === 'string'
          ? monotributo.categoriaMonotributo
          : monotributo.categoriaMonotributo?.descripcionCategoria;
      return categoria ? `Monotributo (${categoria})` : 'Monotributo';
    }

    return null;
  }
}
