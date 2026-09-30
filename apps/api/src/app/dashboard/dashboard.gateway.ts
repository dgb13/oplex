import { Inject, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  getTenantDb,
  NOTIFICATION_CREATED,
  notificationBus,
  PrismaService,
  withTenantContext,
  type NotificationCreatedEvent,
} from '@plexo/database';
import type { Server, Socket } from 'socket.io';
import type {
  InvoiceCreatedEvent,
  InvoicePaidEvent,
  PresenceUser,
  StockUpdatedEvent,
} from './events.js';
import {
  INVOICE_CREATED,
  INVOICE_PAID,
  PRESENCE_OFFLINE,
  PRESENCE_ONLINE,
  PRESENCE_SNAPSHOT,
  STOCK_UPDATED,
} from './events.js';

interface OnlineUser extends PresenceUser {
  socketIds: Set<string>;
}

@WebSocketGateway(3001, {
  cors: { origin: ['http://localhost:4200', 'http://localhost:3000'], credentials: true },
})
export class DashboardGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(DashboardGateway.name);

  // tenantId -> userId -> that user's online sockets. A user can have
  // several tabs/devices open; they're only "offline" once every socket
  // of theirs has disconnected. In-memory only, matching how this
  // gateway already keeps no other persisted connection state - a
  // restart clears presence, which is correct (nobody's actually
  // connected anymore either).
  private readonly onlineByTenant = new Map<string, Map<string, OnlineUser>>();

  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // Avisos de la campana: notify() los emite en notificationBus recién
  // después del commit; acá se empujan sólo a la sala del destinatario
  // (user:<id>), nunca a toda la empresa.
  private readonly onNotification = ({ notification }: NotificationCreatedEvent) => {
    this.server?.to(`user:${notification.recipientUserId}`).emit(NOTIFICATION_CREATED, notification);
  };

  onModuleInit() {
    notificationBus.on(NOTIFICATION_CREATED, this.onNotification);
  }

  onModuleDestroy() {
    notificationBus.off(NOTIFICATION_CREATED, this.onNotification);
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth['token'] as string | undefined;
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwtService.verify<{ sub: string; tenantId: string }>(token);
      client.data['tenantId'] = payload.tenantId;
      client.data['userId'] = payload.sub;
      void client.join(`tenant:${payload.tenantId}`);
      void client.join(`user:${payload.sub}`);
      this.logger.log(`Client connected to tenant room ${payload.tenantId}`);

      await this.trackPresence(client, payload.tenantId, payload.sub);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const tenantId = client.data['tenantId'] as string | undefined;
    const userId = client.data['userId'] as string | undefined;
    this.logger.log(`Client disconnected (tenant: ${tenantId ?? 'unknown'})`);
    if (!tenantId || !userId) {
      return;
    }

    const tenantOnline = this.onlineByTenant.get(tenantId);
    const entry = tenantOnline?.get(userId);
    if (!entry) {
      return;
    }

    entry.socketIds.delete(client.id);
    if (entry.socketIds.size === 0) {
      tenantOnline?.delete(userId);
      this.server.to(`tenant:${tenantId}`).emit(PRESENCE_OFFLINE, { userId });
    }
  }

  /**
   * Opt-in: a user with showOnlinePresence=false still joins the tenant
   * room (so they get stock/invoice events like everyone else), but never
   * appears in anyone's online list and never triggers a presence
   * broadcast - their own connection is simply invisible to tenant-mates.
   */
  private async trackPresence(client: Socket, tenantId: string, userId: string): Promise<void> {
    const user = await withTenantContext(this.prisma, tenantId, () =>
      getTenantDb().user.findUnique({ where: { id: userId } }),
    );
    if (!user || !user.showOnlinePresence) {
      return;
    }

    let tenantOnline = this.onlineByTenant.get(tenantId);
    if (!tenantOnline) {
      tenantOnline = new Map();
      this.onlineByTenant.set(tenantId, tenantOnline);
    }

    const existing = tenantOnline.get(userId);
    if (existing) {
      existing.socketIds.add(client.id);
    } else {
      tenantOnline.set(userId, {
        userId,
        name: user.name,
        email: user.email,
        socketIds: new Set([client.id]),
      });
      this.server.to(`tenant:${tenantId}`).emit(PRESENCE_ONLINE, {
        userId,
        name: user.name,
        email: user.email,
      });
    }

    const online: PresenceUser[] = [...tenantOnline.values()].map(({ userId: id, name, email }) => ({
      userId: id,
      name,
      email,
    }));
    client.emit(PRESENCE_SNAPSHOT, { online });
  }

  @OnEvent(STOCK_UPDATED)
  onStockUpdated(event: StockUpdatedEvent) {
    this.server.to(`tenant:${event.tenantId}`).emit(STOCK_UPDATED, event);
  }

  @OnEvent(INVOICE_CREATED)
  onInvoiceCreated(event: InvoiceCreatedEvent) {
    this.server.to(`tenant:${event.tenantId}`).emit(INVOICE_CREATED, event);
  }

  @OnEvent(INVOICE_PAID)
  onInvoicePaid(event: InvoicePaidEvent) {
    this.server.to(`tenant:${event.tenantId}`).emit(INVOICE_PAID, event);
  }
}
