import { BadRequestException, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OAuthConfigService } from './oauth-config.service.js';

/** Wraps Passport's own AuthGuard('google') with a config check up front -
 * without it, hitting this route with no GOOGLE_CLIENT_ID/SECRET set would
 * either 500 deep inside passport-oauth2 or silently redirect to a broken
 * Google authorize URL. A clear 400 here is what lets the frontend's
 * "próximamente" state (driven by GET /auth/oauth/providers) stay honest
 * even if someone bypasses the disabled button and hits the URL directly. */
@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  constructor(private readonly oauthConfigService: OAuthConfigService) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    if (!this.oauthConfigService.isGoogleConfigured()) {
      throw new BadRequestException('Google OAuth no está configurado en este entorno');
    }
    return super.canActivate(context);
  }

  // Passport's own `strategy.redirect()` (the "go to Google's consent
  // screen" step) writes directly on `res` (`res.statusCode`/`setHeader`/
  // `end()`) - it never goes through the verify callback, see passport's
  // authenticate.js. Nest's Fastify adapter hands guards the FastifyReply
  // wrapper, which has no `setHeader`/`end` (`TypeError: res.setHeader is
  // not a function`) - `.raw` is the real underlying http.ServerResponse
  // Passport expects.
  override getResponse(context: ExecutionContext) {
    return context.switchToHttp().getResponse().raw;
  }
}
