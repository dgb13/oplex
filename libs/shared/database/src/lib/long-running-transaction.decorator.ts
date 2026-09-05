import { SetMetadata } from '@nestjs/common';

export const LONG_RUNNING_TRANSACTION_KEY = 'longRunningTransactionTimeoutMs';

/**
 * Opt-in per route, mismo patrón que @AuditEntity (ver audit-entity.decorator.ts)
 * - TenantContextInterceptor lee esto vía Reflector para abrir la
 * transacción de ESTE request con un timeout más largo que el default de
 * Prisma (5000ms). Necesario para cualquier ruta que haga una llamada de
 * red lenta (una API externa, ej. Claude vision) DENTRO de la transacción
 * que el interceptor ya abre para toda la request - sin esto, Prisma
 * corta la transacción a los 5s aunque la llamada externa siga en curso
 * (encontrado en vivo en el módulo de Carga de comprobantes IA, ver
 * PROGRESS.md). Deliberadamente opt-in, no un timeout global más largo -
 * mantener conexiones del pool abiertas más tiempo por default sería
 * peligroso bajo carga para el resto de las rutas, que sí deben fallar
 * rápido si algo se cuelga.
 */
export const LongRunningTransaction = (timeoutMs: number) =>
  SetMetadata(LONG_RUNNING_TRANSACTION_KEY, timeoutMs);
