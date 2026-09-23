import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Public } from '@plexo/auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { OAuthChooseTenantDto } from '../dto/oauth-choose-tenant.dto.js';
import { OAuthCompleteSignupDto } from '../dto/oauth-complete-signup.dto.js';
import { AppleOAuthGuard } from './apple-oauth.guard.js';
import { GoogleOAuthGuard } from './google-oauth.guard.js';
import { MicrosoftOAuthGuard } from './microsoft-oauth.guard.js';
import { OAuthConfigService } from './oauth-config.service.js';
import type { OAuthLoginOutcome } from './oauth.service.js';
import { OAuthService } from './oauth.service.js';
import type { OAuthValidatedProfile } from './oauth.types.js';

type RequestWithOAuthProfile = FastifyRequest & { user: OAuthValidatedProfile };

const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'http://localhost:4200';

@Controller('auth/oauth')
export class OAuthController {
  constructor(
    private readonly oauthConfigService: OAuthConfigService,
    private readonly oauthService: OAuthService,
  ) {}

  @Public()
  @Get('providers')
  getProviders() {
    return this.oauthConfigService.getProviders();
  }

  // Never actually runs - GoogleOAuthGuard redirects the browser to
  // Google's own consent screen before the handler body would execute
  // (standard Passport "initiate" behavior).
  @Public()
  @UseGuards(GoogleOAuthGuard)
  @Get('google')
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- guard redirects before this runs
  googleAuth() {}

  @Public()
  @UseGuards(GoogleOAuthGuard)
  @Get('google/callback')
  async googleCallback(@Req() request: RequestWithOAuthProfile, @Res({ passthrough: false }) reply: FastifyReply) {
    await this.finishOAuth(request.user, reply);
  }

  @Public()
  @UseGuards(MicrosoftOAuthGuard)
  @Get('microsoft')
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- guard redirects before this runs
  microsoftAuth() {}

  @Public()
  @UseGuards(MicrosoftOAuthGuard)
  @Get('microsoft/callback')
  async microsoftCallback(
    @Req() request: RequestWithOAuthProfile,
    @Res({ passthrough: false }) reply: FastifyReply,
  ) {
    await this.finishOAuth(request.user, reply);
  }

  // Never actually runs, same as googleAuth/microsoftAuth above.
  @Public()
  @UseGuards(AppleOAuthGuard)
  @Get('apple')
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- guard redirects before this runs
  appleAuth() {}

  // POST, not GET - Apple's own strategy hardcodes response_mode:"form_post"
  // (see passport-apple's authorizationParams), so the browser lands back
  // here via a real form submission, not a query-string redirect like
  // Google/Microsoft. Requires @fastify/formbody registered in main.ts to
  // parse the application/x-www-form-urlencoded body at all.
  @Public()
  @UseGuards(AppleOAuthGuard)
  @Post('apple/callback')
  async appleCallback(@Req() request: RequestWithOAuthProfile, @Res({ passthrough: false }) reply: FastifyReply) {
    await this.finishOAuth(request.user, reply);
  }

  @Public()
  @Post('choose-tenant')
  chooseTenant(@Body() dto: OAuthChooseTenantDto) {
    return this.oauthService.chooseTenant(dto);
  }

  @Public()
  @Post('complete-signup')
  completeSignup(@Body() dto: OAuthCompleteSignupDto) {
    return this.oauthService.completeSignup(dto);
  }

  /** Every OAuth outcome (login/choose-tenant/signup) ends the same way: a
   * full-page redirect back to the frontend's /oauth/callback, which reads
   * whichever query param applies and takes it from there - this has to be
   * a real browser redirect, not a JSON response, because the whole OAuth
   * dance happened via top-level navigation to Google/Microsoft and back. */
  private async finishOAuth(profile: OAuthValidatedProfile, reply: FastifyReply): Promise<void> {
    const outcome: OAuthLoginOutcome = await this.oauthService.handleOAuthLogin(profile);

    let redirectUrl: string;
    if (outcome.kind === 'login') {
      redirectUrl = `${FRONTEND_URL}/oauth/callback?token=${encodeURIComponent(outcome.accessToken)}`;
    } else if (outcome.kind === 'choose-tenant') {
      const candidatesParam = encodeURIComponent(JSON.stringify(outcome.candidates));
      redirectUrl = `${FRONTEND_URL}/oauth/callback?resolutionToken=${encodeURIComponent(outcome.resolutionToken)}&candidates=${candidatesParam}`;
    } else {
      redirectUrl = `${FRONTEND_URL}/oauth/callback?oauthSignupToken=${encodeURIComponent(outcome.oauthSignupToken)}`;
    }

    // Fastify's reply.redirect(url) only defaults to 302 when no status code
    // has been set on the reply yet - Nest's platform-fastify adapter
    // already stamps 200 on every reply before a handler body runs, so an
    // unqualified reply.redirect(url) here silently reuses that 200 (same
    // root cause already fixed in mercadopago.controller.ts's `redirect()`
    // helper) and the browser never actually navigates - blank page, stuck
    // on this URL. Always pass 302 explicitly.
    reply.redirect(redirectUrl, 302);
  }
}
