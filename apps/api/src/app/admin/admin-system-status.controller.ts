import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '@plexo/auth';
import { AdminSystemStatusService } from './admin-system-status.service.js';

@Controller('admin/system-status')
@UseGuards(PlatformAdminGuard)
export class AdminSystemStatusController {
  constructor(private readonly adminSystemStatusService: AdminSystemStatusService) {}

  @Get()
  getStatus() {
    return this.adminSystemStatusService.getStatus();
  }

  // POST, no GET: dispara una llamada real (con efecto de red, aunque sin
  // side-effect en nuestros datos) contra Meta - ver el doc comment de
  // verifyWhatsAppToken para por qué esto vive aparte de getStatus().
  @Post('whatsapp/verify')
  verifyWhatsApp() {
    return this.adminSystemStatusService.verifyWhatsAppToken();
  }

  // GET normal (a diferencia de verify arriba) - sólo lee de nuestra
  // propia base, nunca pega contra Meta. Se pide aparte de getStatus()
  // porque el N+1 por link (ver el doc comment de listWhatsAppLinks) no
  // vale la pena pagarlo en cada carga de la página para algo que el
  // admin puede no llegar a abrir nunca.
  @Get('whatsapp/links')
  listWhatsAppLinks() {
    return this.adminSystemStatusService.listWhatsAppLinks();
  }
}
