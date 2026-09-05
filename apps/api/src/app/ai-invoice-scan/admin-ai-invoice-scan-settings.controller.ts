import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '@plexo/auth';
import { UpdateAiInvoiceScanSettingsDto } from './dto/update-ai-invoice-scan-settings.dto.js';
import { AiInvoiceScanService } from './ai-invoice-scan.service.js';

// "Escaneo IA" en el panel Admin - kill-switch global, calcado de
// AdminBnaSyncController/AdminMembershipSettingsController.
@Controller('admin/ai-invoice-scan-settings')
@UseGuards(PlatformAdminGuard)
export class AdminAiInvoiceScanSettingsController {
  constructor(private readonly aiInvoiceScanService: AiInvoiceScanService) {}

  @Get()
  getSettings() {
    return this.aiInvoiceScanService.getSettings();
  }

  @Patch()
  updateSettings(@Body() dto: UpdateAiInvoiceScanSettingsDto) {
    return this.aiInvoiceScanService.updateSettings(dto.enabled);
  }
}
