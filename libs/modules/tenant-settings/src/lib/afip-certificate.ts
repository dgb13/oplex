import { generateKeyPairSync } from 'node:crypto';
import forge from 'node-forge';

export interface ParsedAfipCertificate {
  /** Cert's own expiry (notAfter) - stored in the clear, it's not secret,
   * just so the UI can warn "vence en N días" without decrypting anything. */
  expiresAt: Date;
}

/**
 * Parses the uploaded cert/key PEM pair and confirms the key actually
 * belongs to that certificate (matching RSA modulus/exponent) - catches the
 * "pasted the wrong file" mistake at upload time instead of at the first
 * failed WSAA call, where the error would be far less obvious.
 */
export function parseAndValidateAfipCertificate(
  certPem: string,
  keyPem: string,
): ParsedAfipCertificate {
  let certificate: forge.pki.Certificate;
  let privateKey: forge.pki.rsa.PrivateKey;
  try {
    certificate = forge.pki.certificateFromPem(certPem);
  } catch {
    throw new Error('El certificado no es un PEM válido');
  }
  try {
    privateKey = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
  } catch {
    throw new Error('La clave privada no es un PEM válido');
  }

  const publicKey = certificate.publicKey as forge.pki.rsa.PublicKey;
  const matches =
    publicKey.n.compareTo(privateKey.n) === 0 && publicKey.e.compareTo(privateKey.e) === 0;
  if (!matches) {
    throw new Error('La clave privada no corresponde al certificado');
  }

  return { expiresAt: certificate.validity.notAfter };
}

export type AfipFileKind = 'CERTIFICATE' | 'CSR' | 'PRIVATE_KEY' | 'UNKNOWN';

/** Qué es un archivo por su CONTENIDO, no por la extensión: un certificado
 * guardado como ".csr" o ".txt" se reconoce igual, y el pedido (CSR) subido
 * por error en lugar del certificado se detecta antes de guardar. */
export function detectAfipFileKind(text: string): AfipFileKind {
  if (/-----BEGIN CERTIFICATE REQUEST-----/.test(text) || /-----BEGIN NEW CERTIFICATE REQUEST-----/.test(text)) {
    return 'CSR';
  }
  if (/-----BEGIN CERTIFICATE-----/.test(text)) return 'CERTIFICATE';
  if (/-----BEGIN (RSA |ENCRYPTED )?PRIVATE KEY-----/.test(text)) return 'PRIVATE_KEY';
  return 'UNKNOWN';
}

export interface AfipCertificateInfo {
  // CN = "nombre simbólico" que se eligió en WSASS (p. ej. "oplexhomo").
  alias: string | null;
  // Sólo dígitos, del serialNumber "CUIT 20270403949" del titular.
  cuit: string | null;
  issuer: string | null;
  // Homologación si lo emitió "Computadores Test"; producción si no.
  env: 'HOMOLOGACION' | 'PRODUCCION';
  expiresAt: Date;
}

function attr(attrs: forge.pki.CertificateField[], shortOrType: string): string | null {
  const found = attrs.find((a) => a.shortName === shortOrType || a.type === shortOrType || a.name === shortOrType);
  return found ? String(found.value) : null;
}

export function inspectAfipCertificate(certPem: string): AfipCertificateInfo {
  let certificate: forge.pki.Certificate;
  try {
    certificate = forge.pki.certificateFromPem(certPem);
  } catch {
    throw new Error('El certificado no es un PEM válido');
  }
  const subject = certificate.subject.attributes;
  const issuer = attr(certificate.issuer.attributes, 'CN');
  // serialNumber = OID 2.5.4.5
  const serial = attr(subject, '2.5.4.5') ?? attr(subject, 'serialNumber');
  const cuit = serial ? serial.replace(/\D/g, '') || null : null;
  return {
    alias: attr(subject, 'CN'),
    cuit,
    issuer,
    // Emisor exacto de ARCA: "Computadores Test" (homologación) vs
    // "Computadores" (producción) - no cualquier "test" en el nombre.
    env: issuer && /^computadores test$/i.test(issuer.trim()) ? 'HOMOLOGACION' : 'PRODUCCION',
    expiresAt: certificate.validity.notAfter,
  };
}

/** Clave RSA 2048 + pedido de certificado (CSR PKCS#10, SHA-256) con el
 * sujeto que pide ARCA: C=AR, O=<razón social>, CN=<nombre simbólico>,
 * serialNumber="CUIT <cuit>". La clave se genera con el crypto nativo de
 * Node (rápido, no bloquea como forge en JS puro) y el CSR se firma con
 * forge. Reemplaza el comando de OpenSSL que antes había que correr a mano. */
export function generateAfipKeyAndCsr(input: { cuit: string; organization: string; alias: string }): {
  keyPem: string;
  csrPem: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = forge.pki.publicKeyFromPem(publicKey);
  csr.setSubject([
    { shortName: 'C', value: 'AR' },
    { shortName: 'O', value: input.organization },
    { shortName: 'CN', value: input.alias },
    { type: '2.5.4.5', value: `CUIT ${input.cuit.replace(/\D/g, '')}` },
  ]);
  csr.sign(forge.pki.privateKeyFromPem(privateKey) as forge.pki.rsa.PrivateKey, forge.md.sha256.create());
  return { keyPem: privateKey, csrPem: forge.pki.certificationRequestToPem(csr) };
}
