import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '@plexo/auth';
import { SubscriptionService } from './subscription.service.js';

// Público a propósito: el landing/onboarding necesita mostrar la tabla
// comparativa de planes antes de que exista ningún login. Sin @Public(),
// JwtAuthGuard (global) rechazaría el request antes de llegar acá.
@Controller('plans')
export class PlansController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Public()
  @Get()
  list() {
    return this.subscriptionService.listActivePlans();
  }

  // Público, consumido por /sla/[planKey] en el frontend - devuelve sólo el
  // documento de SLA (Markdown) de ese plan, no el Plan comercial completo.
  @Public()
  @Get(':key/sla')
  getSla(@Param('key') key: string) {
    return this.subscriptionService.getPlanSla(key);
  }
}
