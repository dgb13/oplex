import { BadRequestException, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OAuthConfigService } from './oauth-config.service.js';

/** Same reasoning as GoogleOAuthGuard/MicrosoftOAuthGuard - a clear 400
 * before Passport would otherwise fail deep inside token-exchange with a
 * confusing error (or, worse for Apple specifically, generate an invalid
 * ES256 client_secret from placeholder key material and get a cryptic
 * rejection from Apple's own token endpoint). */
@Injectable()
export class AppleOAuthGuard extends AuthGuard('apple') {
  constructor(private readonly oauthConfigService: OAuthConfigService) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    if (!this.oauthConfigService.isAppleConfigured()) {
      throw new BadRequestException('Apple OAuth no está configurado en este entorno');
    }
    return super.canActivate(context);
  }

  // Same reasoning as GoogleOAuthGuard.getResponse - Passport's
  // `strategy.redirect()` needs the real http.ServerResponse, not the
  // FastifyReply wrapper Nest hands guards by default.
  override getResponse(context: ExecutionContext) {
    return context.switchToHttp().getResponse().raw;
  }
}
