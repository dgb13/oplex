import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '@plexo/auth';
import { UpdateMembershipSettingsDto } from './dto/update-membership-settings.dto.js';
import { MembershipsService } from './memberships.service.js';

// "Duración de sesión de membership" en el panel Admin - calcado de
// AdminBnaSyncController (apps/api/src/app/scheduler/admin-bna-sync.controller.ts).
@Controller('admin/membership-settings')
@UseGuards(PlatformAdminGuard)
export class AdminMembershipSettingsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get()
  getSettings() {
    return this.membershipsService.getSettings();
  }

  @Patch()
  updateSettings(@Body() dto: UpdateMembershipSettingsDto) {
    return this.membershipsService.updateSettings(dto.membershipSessionDurationHours);
  }
}
