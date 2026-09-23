import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { SignOptions } from 'jsonwebtoken';
import { ActivityLogModule } from '@plexo/activity-log';
import { AuthEmailModule } from '@plexo/auth-email';
import { SubscriptionModule } from '@plexo/subscriptions';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AppleOAuthGuard } from './oauth/apple-oauth.guard.js';
import { AppleStrategy } from './oauth/apple.strategy.js';
import { GoogleOAuthGuard } from './oauth/google-oauth.guard.js';
import { GoogleStrategy } from './oauth/google.strategy.js';
import { MicrosoftOAuthGuard } from './oauth/microsoft-oauth.guard.js';
import { MicrosoftStrategy } from './oauth/microsoft.strategy.js';
import { OAuthConfigService } from './oauth/oauth-config.service.js';
import { OAuthController } from './oauth/oauth.controller.js';
import { OAuthService } from './oauth/oauth.service.js';
import { SignupService } from './signup.service.js';
import { TenantProvisioningService } from './tenant-provisioning.service.js';
import { UserAvatarService } from './user-avatar.service.js';

@Module({
  imports: [
    ActivityLogModule,
    SubscriptionModule,
    AuthEmailModule,
    PassportModule,
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const secret = process.env['JWT_SECRET'];
        if (!secret) {
          throw new Error('JWT_SECRET is not set');
        }
        return {
          secret,
          signOptions: { expiresIn: (process.env['JWT_EXPIRES_IN'] ?? '8h') as SignOptions['expiresIn'] },
        };
      },
    }),
  ],
  controllers: [AuthController, OAuthController],
  providers: [
    AuthService,
    TenantProvisioningService,
    UserAvatarService,
    SignupService,
    OAuthConfigService,
    OAuthService,
    GoogleStrategy,
    MicrosoftStrategy,
    AppleStrategy,
    GoogleOAuthGuard,
    MicrosoftOAuthGuard,
    AppleOAuthGuard,
  ],
  exports: [AuthService, TenantProvisioningService],
})
export class AuthModule {}
