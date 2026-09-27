// Movido a @plexo/afip-credentials (lo usan también el padrón de la
// plataforma y Admin) - re-exportado acá para no tocar los imports locales.
export {
  detectAfipFileKind,
  generateAfipKeyAndCsr,
  inspectAfipCertificate,
  parseAndValidateAfipCertificate,
  type AfipCertificateInfo,
  type AfipFileKind,
  type ParsedAfipCertificate,
} from '@plexo/afip-credentials';
