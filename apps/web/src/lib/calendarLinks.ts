/** Resuelve el `link` de un CalendarEntry derivado a una ruta real de la
 * app (Fase 2 de la Agenda, ver docs/plan-agenda.md). Sólo `production-
 * order` tiene una página de detalle propia (`/production/orders/[id]`) -
 * invoice/purchase-invoice/cash-session/tax-deadline no, así que navegan al
 * listado del módulo en vez de a un registro puntual. Sigue siendo
 * "navegación al documento origen" en el sentido que pide el plan (deja la
 * Agenda y entra al módulo dueño del dato), sólo que no todos los módulos
 * tienen hoy una URL por-registro para apuntar más fino. */
export function resolveCalendarLink(link: { module: string; id: string }): string {
  switch (link.module) {
    case 'production-order':
      return `/production/orders/${link.id}`;
    case 'invoice':
      return '/invoicing';
    case 'purchase-invoice':
      return '/purchases';
    case 'cash-session':
      return '/pos/history';
    case 'tax-deadline':
      return '/taxes';
    default:
      return '/agenda';
  }
}
