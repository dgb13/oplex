import { Module } from '@nestjs/common';
import { AuthEmailModule } from '@plexo/auth-email';
import { LegalController } from './legal.controller.js';
import { LegalService } from './legal.service.js';

/** Contrato de uso: aceptación registrada, arrepentimiento y baja. */
@Module({
  imports: [AuthEmailModule],
  controllers: [LegalController],
  providers: [LegalService],
  exports: [LegalService],
})
export class LegalModule {}
