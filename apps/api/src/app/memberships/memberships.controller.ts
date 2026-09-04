import { Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '@plexo/auth';
import type { AuthenticatedUser } from '@plexo/types';
import { MembershipsService } from './memberships.service.js';

// Quién dentro del estudio puede hacer qué (ver docs/plan_modulo_contadores.txt,
// punto 1): activar una sesión en un cliente ya-aceptado es trabajo del día
// a día, no una decisión administrativa - por eso ACCOUNTANT entra acá,
// distinto de crear/aceptar/revocar la relación en sí (esa parte, todavía
// sin construir en esta sub-fase, queda gateada a OWNER/ADMIN nada más).
const ACTIVATE_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT'] as const;

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

  @Post(':id/activate')
  @Roles(...ACTIVATE_ROLES)
  activate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.membershipsService.activate(id, user.sub, user.tenantId);
  }
}
