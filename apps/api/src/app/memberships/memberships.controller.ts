import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '@plexo/auth';
import type { AuthenticatedUser } from '@plexo/types';
import { InviteMembershipDto } from './dto/invite-membership.dto.js';
import { RespondMembershipDto } from './dto/respond-membership.dto.js';
import { MembershipsService } from './memberships.service.js';

// Quién dentro del estudio puede hacer qué (ver docs/plan_modulo_contadores.txt,
// punto 1): activar una sesión en un cliente ya-aceptado es trabajo del día
// a día, no una decisión administrativa - por eso ACCOUNTANT entra ahí.
// Invitar/pedir acceso/responder/revocar SÍ son decisiones administrativas
// (dan o cortan acceso a un tenant entero), quedan gateadas a OWNER/ADMIN
// nada más - mismo criterio en ambos lados de la relación (no hay forma de
// saber de antemano si quien llama es "el cliente" o "el estudio" para esa
// ruta puntual, así que el mismo gate aplica a las dos.
const ACTIVATE_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT'] as const;
const ADMIN_ROLES = ['OWNER', 'ADMIN'] as const;

@Controller('memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  /** Cartera del estudio del que llama (todas las membresías, cualquier
   * status) - ver MembershipsService.listMine. */
  @Get()
  @Roles(...ACTIVATE_ROLES)
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.membershipsService.listMine(user.tenantId);
  }

  /** Relaciones donde el que llama es el CLIENTE (invitaciones que mandó,
   * solicitudes que le llegaron) - vista espejo de listMine(). */
  @Get('as-client')
  @Roles(...ADMIN_ROLES)
  listAsClient() {
    return this.membershipsService.listForClient();
  }

  /** Cartera consolidada (sólo clientes ACCEPTED, con resumen liviano por
   * cliente) - ver MembershipsService.getPortfolio. */
  @Get('portfolio')
  @Roles(...ACTIVATE_ROLES)
  getPortfolio(@CurrentUser() user: AuthenticatedUser) {
    return this.membershipsService.getPortfolio(user.tenantId);
  }

  @Post(':id/activate')
  @Roles(...ACTIVATE_ROLES)
  activate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.membershipsService.activate(id, user.sub, user.tenantId);
  }

  /** El cliente invita a un estudio por su email/CUIT. */
  @Post('invite')
  @Roles(...ADMIN_ROLES)
  invite(@Body() dto: InviteMembershipDto, @CurrentUser() user: AuthenticatedUser) {
    return this.membershipsService.inviteFromClient(dto.identifier, user.tenantId, user.sub);
  }

  /** El estudio pide acceso a un cliente por su email/CUIT. */
  @Post('request')
  @Roles(...ADMIN_ROLES)
  request(@Body() dto: InviteMembershipDto, @CurrentUser() user: AuthenticatedUser) {
    return this.membershipsService.requestFromStudio(dto.identifier, user.tenantId, user.sub);
  }

  /** Acepta/rechaza una solicitud PENDING dirigida a mí - el service decide
   * si "yo" soy el cliente o el estudio de esa fila puntual. */
  @Post(':id/respond')
  @Roles(...ADMIN_ROLES)
  respond(@Param('id') id: string, @Body() dto: RespondMembershipDto, @CurrentUser() user: AuthenticatedUser) {
    return this.membershipsService.respond(id, user.tenantId, dto.decision);
  }

  /** Corta una relación ACCEPTED - cualquiera de las dos partes. */
  @Post(':id/revoke')
  @Roles(...ADMIN_ROLES)
  revoke(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.membershipsService.revoke(id, user.tenantId);
  }
}
