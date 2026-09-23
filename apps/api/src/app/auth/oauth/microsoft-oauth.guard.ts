import { BadRequestException, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OAuthConfigService } from './oauth-config.service.js';

/** Same reasoning as GoogleOAuthGuard, for Microsoft. */
@Injectable()
export class MicrosoftOAuthGuard extends AuthGuard('microsoft') {
  constructor(private readonly oauthConfigService: OAuthConfigService) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    if (!this.oauthConfigService.isMicrosoftConfigured()) {
      throw new BadRequestException('Microsoft OAuth no está configurado en este entorno');
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
