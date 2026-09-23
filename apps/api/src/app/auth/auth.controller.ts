import { BadRequestException, Body, Controller, Delete, Get, Patch, Post, Req } from '@nestjs/common';
import { AllowWhenPasswordChangeRequired, CurrentUser, Public } from '@plexo/auth';
import type { AuthenticatedUser } from '@plexo/types';
import type { FastifyRequest } from 'fastify';
import '@fastify/multipart';
import { AuthService } from './auth.service.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ResendCodeDto } from './dto/resend-code.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ResolveTenantDto } from './dto/resolve-tenant.dto.js';
import { SignupDto } from './dto/signup.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UserAvatarService } from './user-avatar.service.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { SignupService } from './signup.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly signupService: SignupService,
    private readonly userAvatarService: UserAvatarService,
  ) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: FastifyRequest) {
    return this.authService.login(dto, request.ip ?? null);
  }

  @Public()
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.signupService.signup(dto);
  }

  @Public()
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.signupService.verifyEmail(dto);
  }

  @Public()
  @Post('resend-code')
  resendCode(@Body() dto: ResendCodeDto) {
    return this.signupService.resendCode(dto);
  }

  @Public()
  @Post('resolve-tenant')
  resolveTenant(@Body() dto: ResolveTenantDto) {
    return this.authService.resolveTenant(dto);
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @AllowWhenPasswordChangeRequired()
  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.sub);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user.sub, dto);
  }

  @Post('me/avatar')
  async uploadAvatar(@CurrentUser() user: AuthenticatedUser, @Req() req: FastifyRequest) {
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    const buffer = await data.toBuffer();
    const updated = await this.userAvatarService.setAvatar(user.sub, data.mimetype, buffer);
    return this.authService.getProfile(updated.id);
  }

  @Delete('me/avatar')
  async removeAvatar(@CurrentUser() user: AuthenticatedUser) {
    const updated = await this.userAvatarService.removeAvatar(user.sub);
    return this.authService.getProfile(updated.id);
  }

  // Read-only, no business action - dejarla bloqueada sólo dejaría el
  // ActivityCard del perfil pegado en "Cargando..." sin motivo real.
  @AllowWhenPasswordChangeRequired()
  @Get('me/activity')
  getMyActivity(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMyActivity(user.sub);
  }

  @AllowWhenPasswordChangeRequired()
  @Post('change-password')
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.sub, dto);
  }
}
