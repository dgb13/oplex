import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '@plexo/auth';
import { AdminAiStatusService } from './admin-ai-status.service.js';

// Inteligencia artificial (Anthropic) en Configuración del sistema - ver AdminAiStatusService.
@Controller('admin/ai')
@UseGuards(PlatformAdminGuard)
export class AdminAiStatusController {
  constructor(private readonly aiStatus: AdminAiStatusService) {}

  @Get()
  getStatus() {
    return this.aiStatus.getStatus();
  }

  // POST: consulta a Anthropic (models.retrieve, sin costo) y guarda el resultado.
  @Post('test')
  test() {
    return this.aiStatus.test();
  }
}
