import { Module } from '@nestjs/common';
import { AuthEmailModule } from '@plexo/auth-email';
import { AdminSupportController } from './admin-support.controller.js';
import { AdminSupportService } from './admin-support.service.js';
import { SupportController } from './support.controller.js';
import { SupportService } from './support.service.js';

/** Soporte: consultas de los usuarios a Oplex, con capturas, y la bandeja
 * del backoffice. Los avisos van a soporte@oplex.com.ar. */
@Module({
  imports: [AuthEmailModule],
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService, AdminSupportService],
})
export class SupportModule {}
