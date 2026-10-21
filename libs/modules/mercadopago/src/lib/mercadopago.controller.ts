import { BadRequestException, Controller, Get, Logger, Post, Query, Res } from '@nestjs/common';
import { Public, Roles } from '@plexo/auth';
import { ConnectorService } from '@plexo/connectors';
import { getTenantDb, getTenantId, getUserId, PrismaService, withTenantContext } from '@plexo/database';
import type { FastifyReply } from 'fastify';
import { MercadoPagoCallbackQueryDto } from './dto/mercadopago-callback-query.dto.js';
import { generateCodeVerifier } from './pkce.js';
import { MercadoPagoConnector } from './mercadopago.connector.js';
import { MercadoPagoStateService } from './mercadopago-state.service.js';

const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'http://localhost:4200';

// Where the callback lands the browser once it's done - the Mercado Pago
// section (apps/web/src/app/mercadopago), which reads the query flag to
// show the result once.
function redirectTarget(status: 'connected' | 'error' | 'denied'): string {
  return `${FRONTEND_URL}/mercadopago?connector=mercadopago&status=${status}`;
}

/**
 * Fastify's reply.redirect(url) only defaults to 302 when no status code
 * has been set on the reply yet - Nest's platform-fastify adapter already
 * stamps 200 on every reply before a handler body runs, so an unqualified
 * reply.redirect(url) here would silently reuse that 200 (confirmed by
 * reading fastify's own Reply.prototype.redirect - it does
 * `code = hasStatusCode ? this.raw.statusCode : 302`) and the browser
 * would never actually navigate. Always pass 302 explicitly.
 */
function redirect(reply: FastifyReply, url: string): void {
  reply.redirect(url, 302);
}

interface McpConnectorStatusResponse {
  status: 'DISCONNECTED' | 'PENDING' | 'CONNECTED' | 'EXPIRED' | 'REVOKED' | 'ERROR';
  nickname: string | null;
  connectedAt: Date | null;
  /** Who in this tenant authorized the account - shown in the section's
   * Configuración tab. */
  connectedByName: string | null;
}

@Controller('connectors/mercadopago')
export class MercadoPagoController {
  private readonly logger = new Logger(MercadoPagoController.name);

  constructor(
    private readonly connector: MercadoPagoConnector,
    private readonly connectorService: ConnectorService,
    private readonly stateService: MercadoPagoStateService,
    private readonly prisma: PrismaService,
  ) {}

  @Roles('OWNER', 'ADMIN')
  @Get('authorize')
  authorize(): { authorizationUrl: string } {
    const tenantId = getTenantId();
    const userId = getUserId();
    if (!userId) {
      // Can't happen on an authenticated route in practice - JwtAuthGuard
      // always sets request.user.sub before this runs - but the type is
      // string | undefined, so guard against it explicitly rather than
      // silently sign a state with userId: undefined.
      throw new BadRequestException('No se pudo identificar al usuario autenticado');
    }

    const codeVerifier = generateCodeVerifier();
    const state = this.stateService.sign({ tenantId, userId, codeVerifier });
    const authorizationUrl = this.connector.getAuthorizationUrl(tenantId, state);
    return { authorizationUrl };
  }

  /**
   * @Public() - MP redirects the browser here with a full-page navigation,
   * which never carries the app's bearer token (OPLEX auth is
   * Authorization-header based, no cookies - see the design discussion in
   * PROGRESS.md/this session). `state` alone authenticates this request:
   * it's a JWT only this server could have signed, in `authorize()` above,
   * moments earlier. TenantContextInterceptor also no-ops for @Public()
   * routes (no request.user to read a tenantId off), so tenant context is
   * opened by hand below, exactly like AuthService.login/OAuthService do
   * for the same reason.
   */
  @Public()
  @Get('callback')
  async callback(@Query() query: MercadoPagoCallbackQueryDto, @Res({ passthrough: false }) reply: FastifyReply) {
    if (query.error || !query.code || !query.state) {
      redirect(reply, redirectTarget(query.error === 'access_denied' ? 'denied' : 'error'));
      return;
    }

    let tenantId: string;
    let userId: string;
    try {
      ({ tenantId, userId } = this.stateService.verify(query.state));
    } catch {
      redirect(reply, redirectTarget('error'));
      return;
    }

    try {
      await withTenantContext(
        this.prisma,
        tenantId,
        () => this.connector.handleOAuthCallback(tenantId, query.code as string, query.state as string),
        userId,
      );
      redirect(reply, redirectTarget('connected'));
    } catch (err) {
      this.logger.error(`Fallo al completar el OAuth de Mercado Pago para tenant ${tenantId}: ${err}`);
      redirect(reply, redirectTarget('error'));
    }
  }

  @Roles('OWNER', 'ADMIN')
  @Post('disconnect')
  async disconnect(): Promise<{ status: 'DISCONNECTED' }> {
    await this.connector.disconnect(getTenantId());
    return { status: 'DISCONNECTED' };
  }

  @Get('status')
  async status(): Promise<McpConnectorStatusResponse> {
    const connector = await this.connectorService.getConnector('MERCADO_PAGO');
    if (!connector) {
      return { status: 'DISCONNECTED', nickname: null, connectedAt: null, connectedByName: null };
    }
    const connectedBy = connector.connectedByUserId
      ? await getTenantDb().user.findUnique({
          where: { id: connector.connectedByUserId },
          select: { name: true, email: true },
        })
      : null;
    return {
      status: connector.status,
      nickname: connector.externalNickname ?? null,
      connectedAt: connector.connectedAt ?? null,
      connectedByName: connectedBy ? (connectedBy.name ?? connectedBy.email) : null,
    };
  }
}
