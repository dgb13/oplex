import { Module } from '@nestjs/common';
import { AuthEmailModule } from '@plexo/auth-email';
import { AuthModule } from '../auth/auth.module.js';
import { AdminMembershipSettingsController } from './admin-membership-settings.controller.js';
import { MembershipsController } from './memberships.controller.js';
import { MembershipsService } from './memberships.service.js';

@Module({
  imports: [AuthModule, AuthEmailModule],
  controllers: [MembershipsController, AdminMembershipSettingsController],
  providers: [MembershipsService],
})
export class MembershipsModule {}
