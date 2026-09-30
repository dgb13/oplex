import { getTenantDb } from '@plexo/database';

/**
 * Documentos sobre los que se puede comentar/asignar tareas, y adónde lleva
 * cada uno en el front. Mismo vocabulario que CalendarEvent.linkType (y que
 * apps/web/src/lib/calendarLinks.ts). Para sumar un documento nuevo alcanza
 * con agregarlo acá.
 */
export const COMMENTABLE_ENTITIES = ['production-order'] as const;
export type CommentableEntity = (typeof COMMENTABLE_ENTITIES)[number];

export function entityLink(entityType: string, entityId: string): string {
  switch (entityType) {
    case 'production-order':
      return `/production/orders/${entityId}`;
    default:
      return '/agenda';
  }
}

/** Cómo nombrar el documento en un aviso ("OP-000042"). Null si no existe
 * (o no es de esta empresa - RLS lo oculta igual que si no existiera). */
export async function entityLabel(entityType: string, entityId: string): Promise<string | null> {
  switch (entityType) {
    case 'production-order': {
      const order = await getTenantDb().productionOrder.findUnique({ where: { id: entityId }, select: { number: true } });
      return order?.number ?? null;
    }
    default:
      return null;
  }
}
