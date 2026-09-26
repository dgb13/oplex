import { Injectable, Optional } from '@nestjs/common';
import { getTenantDb, getTenantId, PrismaService, withTenantContext } from '@plexo/database';
import { EncryptionService } from '@plexo/encryption';
import type { WsaaTicket, WsaaTicketStore } from './afip-wsaa-client.js';

export interface AfipCredentials {
  certPem: string;
  keyPem: string;
  /** The CUIT the certificate is registered under - who's "asking" AFIP,
   * not the CUIT being looked up/invoiced. Always the current tenant's own
   * Tenant.taxId. */
  cuitRepresentada: string;
  env: 'homologacion' | 'produccion';
  ticketStore: WsaaTicketStore;
}

/**
 * Resolves the CURRENT tenant's AFIP credentials at call time - deliberately
 * not something baked into a service's constructor via a factory provider,
 * since a factory provider runs once at app boot, before any
 * request/tenant context exists (one certificate for the whole instance,
 * incompatible with multi-tenant - the trap both WSFE and the padrón
 * lookup used to fall into with process-wide env vars). Every consumer
 * (padrón lookup, WSFE) must call getCurrent() from inside the method that
 * actually needs it, so it always reads whichever tenant is active for
 * that request.
 */
@Injectable()
export class AfipCredentialsService {
  constructor(
    private readonly encryption: EncryptionService,
    // Para guardar tickets de WSAA en una transacción PROPIA (ver
    // ticketStoreFor). Opcional sólo para los tests unitarios.
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /** null = this tenant hasn't uploaded a certificate yet, or has no CUIT
   * set - callers should surface a clear "not configured" error to the user
   * action that triggered it (same convention as StubAfipPadronService),
   * not throw here. */
  async getCurrent(): Promise<AfipCredentials | null> {
    const tenantId = getTenantId();
    const db = getTenantDb();
    const [settings, tenant] = await Promise.all([
      db.tenantSettings.findUnique({ where: { tenantId } }),
      db.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    ]);

    if (!settings?.afipCertEncrypted || !settings.afipKeyEncrypted || !tenant.taxId) {
      return null;
    }

    return {
      certPem: this.encryption.decrypt(settings.afipCertEncrypted),
      keyPem: this.encryption.decrypt(settings.afipKeyEncrypted),
      cuitRepresentada: tenant.taxId,
      env: settings.afipEnv === 'PRODUCCION' ? 'produccion' : 'homologacion',
      ticketStore: this.ticketStoreFor(tenantId),
    };
  }

  /** Tickets de WSAA de ESTE tenant, cifrados en
   * TenantSettings.afipWsaaTicketsEncrypted como { servicio: ticket }. Se
   * resuelve con el tenantId capturado ahora, no con el contexto del
   * momento en que se usa. Guardar un ticket es best-effort: si falla, la
   * operación con ARCA sigue igual. */
  private ticketStoreFor(tenantId: string): WsaaTicketStore {
    const readAll = async (): Promise<Record<string, { token: string; sign: string; expiresAt: string }>> => {
      const row = await getTenantDb().tenantSettings.findUnique({
        where: { tenantId },
        select: { afipWsaaTicketsEncrypted: true },
      });
      if (!row?.afipWsaaTicketsEncrypted) return {};
      try {
        return JSON.parse(this.encryption.decrypt(row.afipWsaaTicketsEncrypted));
      } catch {
        return {};
      }
    };
    return {
      load: async (service) => {
        const entry = (await readAll())[service];
        return entry ? { token: entry.token, sign: entry.sign, expiresAt: new Date(entry.expiresAt) } : null;
      },
      save: async (service: string, ticket: WsaaTicket) => {
        try {
          const all = await readAll();
          all[service] = { token: ticket.token, sign: ticket.sign, expiresAt: ticket.expiresAt.toISOString() };
          const write = () =>
            getTenantDb().tenantSettings.update({
              where: { tenantId },
              data: { afipWsaaTicketsEncrypted: this.encryption.encrypt(JSON.stringify(all)) },
            });
          // En su propia transacción, que confirma YA: si se guardara en la
          // del request y la venta falla después (ARCA rechaza el
          // comprobante, timeout...), el rollback se llevaría el ticket y
          // ARCA no deja pedir otro por ~12 h.
          if (this.prisma) {
            await withTenantContext(this.prisma, tenantId, write);
          } else {
            await write();
          }
        } catch {
          // best-effort (ver arriba)
        }
      },
    };
  }
}
