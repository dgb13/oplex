import Script from 'next/script';

// Token de Cloudflare Web Analytics para oplex.com.ar. No es secreto: va
// en el HTML de la página. Se puede pisar con NEXT_PUBLIC_CF_ANALYTICS_TOKEN
// (vacío = sin medición, p. ej. en desarrollo no se carga).
const TOKEN =
  process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN ??
  (process.env.NODE_ENV === 'production' ? 'ae00777327a9401abe8babd136428534' : '');

/**
 * Contador de visitas (Cloudflare Web Analytics: sin cookies, sin cartel de
 * consentimiento). Va SÓLO en las páginas públicas - landing, login/registro,
 * legales - nunca dentro del sistema, donde están los datos de los clientes.
 *
 * spa: false a propósito: la web entra al sistema sin recargar (router.push
 * después del login), y con el modo SPA el script seguiría contando las
 * direcciones internas (/invoicing/..., /clients/...). Así cuenta sólo las
 * cargas directas de estas páginas; los registros salen de Oplex.
 */
export function PublicWebAnalytics() {
  if (!TOKEN) return null;
  return (
    <Script
      src="https://static.cloudflareinsights.com/beacon.min.js"
      strategy="afterInteractive"
      data-cf-beacon={JSON.stringify({ token: TOKEN, spa: false })}
    />
  );
}
