/**
 * Direcciones públicas de Oplex como empresa. Sólo existen estas cuatro:
 * Cloudflare Email Routing reenvía soporte@, facturacion@ e info@ al buzón
 * interno y descarta cualquier otra dirección @oplex.com.ar (catch-all).
 * no-responder@ sólo envía (es el EMAIL_FROM de Resend) y no recibe nada.
 *
 * No usar para los mails que un cliente (tenant) le manda a SUS clientes
 * (facturas, cotizaciones, órdenes de compra, pedidos de la tienda): ahí la
 * respuesta es del tenant, no de Oplex.
 */

/** Consultas y ayuda técnica. Reply-To de todo mail automático que no sea de cobro. */
export const OPLEX_SUPPORT_EMAIL = 'soporte@oplex.com.ar';

/** Pagos, facturas de Oplex, cobros y suscripciones. */
export const OPLEX_BILLING_EMAIL = 'facturacion@oplex.com.ar';

/** Consultas generales y comerciales. */
export const OPLEX_INFO_EMAIL = 'info@oplex.com.ar';

/** Remitente de los mails automáticos - no recibe correo. El valor real
 * que usa la API sale de EMAIL_FROM; esto es sólo la referencia. */
export const OPLEX_NOREPLY_EMAIL = 'no-responder@oplex.com.ar';
