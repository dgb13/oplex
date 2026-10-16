import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, Public, Roles } from '@plexo/auth';
import type { AuthenticatedUser } from '@plexo/types';
import { AcceptInvitationDto } from './dto/accept-invitation.dto.js';
import { ChangeRoleDto } from './dto/change-role.dto.js';
import { InviteUserDto } from './dto/invite-user.dto.js';
import { SendInvitationDto } from './dto/send-invitation.dto.js';
import { ToggleStatusDto } from './dto/toggle-status.dto.js';
import { UsersService } from './users.service.js';
import { AllowWhenReadOnly } from '@plexo/subscriptions';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles('OWNER', 'ADMIN')
  @Get()
  list() {
    return this.usersService.listMembers();
  }

  @Roles('OWNER', 'ADMIN')
  @Post()
  invite(@Body() dto: InviteUserDto) {
    return this.usersService.inviteUser(dto);
  }

  @Roles('OWNER', 'ADMIN')
  @Post('invitations')
  inviteMember(@Body() dto: SendInvitationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.inviteMember(dto, actor);
  }

  @Public()
  @Post('invitations/accept')
  acceptInvitation(@Body() dto: AcceptInvitationDto) {
    return this.usersService.acceptInvitation(dto);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':id/role')
  changeRole(@Param('id') id: string, @Body() dto: ChangeRoleDto) {
    return this.usersService.changeRole(id, dto);
  }

  @Roles('OWNER', 'ADMIN')
  // Desactivar usuarios anda en sólo lectura: es como se entra en los topes
  // de un plan más chico (Basic Gratis).
  @AllowWhenReadOnly()
  @Patch(':id/status')
  toggleStatus(@Param('id') id: string, @Body() dto: ToggleStatusDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.toggleStatus(id, dto, actor);
  }

  @Roles('OWNER', 'ADMIN')
  @Post(':id/reset-password')
  resetMemberPassword(@Param('id') id: string) {
    return this.usersService.resetPasswordForMember(id);
  }
}
