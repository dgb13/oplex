import type { ProductionStatus } from '@/lib/production';

// Mismo criterio que STATUS_LABELS/STATUS_COLORS del Tablero general
// (dashboard/page.tsx) para el status de Factura - un mapa dual por
// enum, compartido por el Tablero de Producción y el detalle de orden.
export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  DRAFT: 'Borrador',
  PLANNED: 'Planificada',
  IN_PROGRESS: 'En curso',
  DONE: 'Completada',
  CANCELLED: 'Cancelada',
};

export const PRODUCTION_STATUS_COLORS: Record<ProductionStatus, string> = {
  DRAFT: 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
  PLANNED: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
  IN_PROGRESS: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300',
  DONE: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  CANCELLED: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-400',
};
