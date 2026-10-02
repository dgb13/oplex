import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma, PrismaClient } from '../generated/client.js';
import type { UserRole } from '../generated/enums.js';

export interface TenantStore {
  tenantId: string;
  userId?: string;
  role?: UserRole;
  tx: Prisma.TransactionClient;
  // Callbacks a correr recién cuando la transacción confirma (ver onCommit).
  afterCommit?: (() => void)[];
  // Pasos a correr al final del request, todavía dentro de la transacción
  // (ver beforeCommit).
  beforeCommit?: (() => Promise<void>)[];
}

/**
 * Carries the current request's tenant id and its RLS-scoped transaction
 * client through the async call chain, so business services can reach it
 * without needing REQUEST-scoped Nest providers. Populated by
 * TenantContextInterceptor, one store per request.
 */
export const tenantContextStorage = new AsyncLocalStorage<TenantStore>();

function requireStore(): TenantStore {
  const store = tenantContextStorage.getStore();
  if (!store) {
    throw new Error(
      'No tenant context active. Is TenantContextInterceptor registered for this route?',
    );
  }
  return store;
}

export function getTenantId(): string {
  return requireStore().tenantId;
}

/**
 * The acting user's id, if any (unset during login - there's no user yet).
 * Business code that needs "who did this" (e.g. changedById on
 * PriceHistory) reads this instead of pulling it off the request directly.
 */
export function getUserId(): string | undefined {
  return requireStore().userId;
}

/**
 * The acting user's role, if any - for the rare case where business logic
 * itself needs to branch on role (e.g. TaxesService gating a rate change
 * by managedByAccountant only for ACCOUNTANT, never for OWNER/ADMIN).
 * Prefer RolesGuard/@Roles() at the route level for anything that isn't
 * this kind of per-record, data-dependent check.
 */
export function getUserRole(): UserRole | undefined {
  return requireStore().role;
}

/**
 * The Prisma client to use for the current request. This is a transaction
 * client with `app.tenant_id` already set via set_config(), so RLS policies
 * apply. Never use the bare PrismaService client for tenant-scoped queries.
 */
export function getTenantDb(): Prisma.TransactionClient {
  return requireStore().tx;
}

/**
 * Opens one transaction, sets app.tenant_id (and app.user_id, if known) on
 * it, and runs `fn` with the tenant context active so
 * getTenantId()/getTenantDb() resolve inside it. Shared by
 * TenantContextInterceptor (per authenticated HTTP request) and anything
 * that needs a tenant-scoped query before a request pipeline exists —
 * login being the obvious case: there's no request.user yet to key an
 * interceptor off of, but we still must query `users` under RLS.
 *
 * app.user_id is read by the audit_log_capture() trigger (see the
 * audit-log-immutability migration) to fill in `changedBy` - it's the only
 * reason it's threaded through here at all, business code should keep
 * using getTenantId(), not this.
 */
/**
 * Corre `fn` recién cuando la transacción del request actual confirma - y
 * nunca si hace rollback. Para efectos hacia afuera que no deben pasar por
 * algo que al final no se guardó (ej. empujar un aviso por el WebSocket:
 * "María terminó tu orden" no puede llegar si completar la orden falló
 * después). Sin contexto de tenant activo, corre en el momento.
 */
export function onCommit(fn: () => void): void {
  const store = tenantContextStorage.getStore();
  if (!store?.afterCommit) {
    fn();
    return;
  }
  store.afterCommit.push(fn);
}

/**
 * Corre `fn` al final del request, después de que todo el resto del
 * trabajo terminó bien pero todavía dentro de la transacción: si `fn`
 * falla, se revierte todo. Para el efecto hacia afuera que no se puede
 * deshacer y tiene que ser lo ÚLTIMO que pase - pedir el CAE a ARCA: si se
 * pide en el medio y después falla otra cosa (stock, cobro, asiento), el
 * rollback borra la factura en Oplex pero ARCA ya la autorizó. Se corren en
 * el orden en que se registraron. Sin contexto de tenant que lo soporte
 * (scripts, tests), corre en el momento.
 */
export async function beforeCommit(fn: () => Promise<void>): Promise<void> {
  const store = tenantContextStorage.getStore();
  if (!store?.beforeCommit) {
    await fn();
    return;
  }
  store.beforeCommit.push(fn);
}

/**
 * Corre `fn` dentro de la misma transacción del tenant pero a nombre de
 * `userId` - para procesos sin usuario logueado (ej. el webhook de Mercado
 * Pago) que igual necesitan un autor: JournalEntry.createdById es
 * obligatorio. También setea app.user_id para que el audit log lo registre.
 */
export async function withActingUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const store = requireStore();
  await store.tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
  return tenantContextStorage.run({ ...store, userId }, fn);
}

export async function withTenantContext<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: () => Promise<T>,
  userId?: string,
  role?: UserRole,
  // Prisma corta la transacción a los 5000ms (su default) sin importar si
  // hay actividad de DB en el medio - sólo hace falta cuando fn() hace una
  // llamada de red lenta adentro (ver @LongRunningTransaction). Nunca subir
  // el default global: mantiene el resto de las rutas fallando rápido si
  // algo se cuelga, en vez de retener conexiones del pool más tiempo.
  timeoutMs?: number,
): Promise<T> {
  const afterCommit: (() => void)[] = [];
  const beforeCommitSteps: (() => Promise<void>)[] = [];
  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      if (userId) {
        await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      }
      return tenantContextStorage.run(
        { tenantId, userId, role, tx, afterCommit, beforeCommit: beforeCommitSteps },
        async () => {
          const value = await fn();
          // Índice y no for..of: un paso puede registrar otro.
          for (let i = 0; i < beforeCommitSteps.length; i++) {
            await beforeCommitSteps[i]();
          }
          return value;
        },
      );
    },
    timeoutMs === undefined ? undefined : { timeout: timeoutMs },
  );
  // Ya confirmó: un callback que falla no debe convertir en error un
  // request que sí se guardó.
  for (const cb of afterCommit) {
    try {
      cb();
    } catch {
      // ignorado a propósito
    }
  }
  return result;
}
