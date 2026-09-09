import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '@plexo/auth';
import { UpdateAssistantSettingsDto } from './dto/update-assistant-settings.dto.js';
import { AssistantSettingsService } from './assistant-settings.service.js';

// "Asistente de IA" en el panel Admin - nombre + rate limit configurables
// sin deploy (ver docs/plan-asistente-ia-conversacional.md, secciones 1 y
// 8.2), calcado de AdminAiInvoiceScanSettingsController.
@Controller('admin/assistant-settings')
@UseGuards(PlatformAdminGuard)
export class AdminAssistantSettingsController {
  constructor(private readonly assistantSettingsService: AssistantSettingsService) {}

  @Get()
  getSettings() {
    return this.assistantSettingsService.getSettings();
  }

  @Patch()
  updateSettings(@Body() dto: UpdateAssistantSettingsDto) {
    return this.assistantSettingsService.updateSettings(dto);
  }
}
