import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminMembershipSettingsController } from './admin-membership-settings.controller.js';
import { MembershipsController } from './memberships.controller.js';
import { MembershipsService } from './memberships.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MembershipsController, AdminMembershipSettingsController],
  providers: [MembershipsService],
})
export class MembershipsModule {}
