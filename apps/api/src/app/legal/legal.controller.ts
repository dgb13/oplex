import { Body, Controller, Post, Req } from '@nestjs/common';
import { AllowWhenPasswordChangeRequired, CurrentUser, Public, Roles } from '@plexo/auth';
import { getTenantDb } from '@plexo/database';
import type { AuthenticatedUser } from '@plexo/types';
import type { FastifyRequest } from 'fastify';
import { CancellationRequestDto, WithdrawalRequestDto } from './dto/legal-request.dto.js';
import { LegalService, type RequestMeta } from './legal.service.js';

export function requestMeta(req: FastifyRequest): RequestMeta {
  const ua = req.headers['user-agent'];
  return { ip: req.ip, userAgent: Array.isArray(ua) ? ua[0] : ua };
}

@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  /** Acepta la versión vigente del contrato (la pide la app a quien no la
   * aceptó todavía). También con la contraseña temporal pendiente. */
  @AllowWhenPasswordChangeRequired()
  @Post('accept')
  accept(@Req() req: FastifyRequest) {
    return this.legal.acceptCurrentTerms(requestMeta(req));
  }

  /** "Botón de arrepentimiento" - público, sin sesión (Res. 424/2020). */
  @Public()
  @Post('withdrawal')
  withdrawal(@Body() dto: WithdrawalRequestDto, @Req() req: FastifyRequest) {
    return this.legal.createRequest('WITHDRAWAL', dto, requestMeta(req));
  }

  /** Baja de la suscripción desde la app (el mismo medio de la
   * contratación). Sólo quien administra la cuenta. */
  @Roles('OWNER', 'ADMIN')
  @Post('cancellation')
  async cancellation(
    @Body() dto: CancellationRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
  ) {
    const me = await getTenantDb().user.findUnique({ where: { id: user.sub }, select: { name: true, email: true } });
    const tenant = await getTenantDb().tenant.findUnique({ where: { id: user.tenantId }, select: { name: true, taxId: true } });
    return this.legal.createRequest(
      'CANCELLATION',
      {
        name: `${me?.name ?? me?.email ?? 'Usuario'} - ${tenant?.name ?? 'empresa'}`,
        email: me?.email ?? user.email,
        taxId: tenant?.taxId ?? undefined,
        message: dto.message,
      },
      requestMeta(req),
      { tenantId: user.tenantId, userId: user.sub },
    );
  }
}
