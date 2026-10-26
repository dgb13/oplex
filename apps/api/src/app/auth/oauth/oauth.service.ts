import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getTenantDb, PrismaService, withTenantContext } from '@plexo/database';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { AuthService } from '../auth.service.js';
import type { OAuthChooseTenantDto } from '../dto/oauth-choose-tenant.dto.js';
import type { OAuthCompleteSignupDto } from '../dto/oauth-complete-signup.dto.js';
import { TenantProvisioningService } from '../tenant-provisioning.service.js';
import type { OAuthValidatedProfile } from './oauth.types.js';

const SIGNUP_DEFAULT_PLAN_KEY = process.env['SIGNUP_DEFAULT_PLAN_KEY'] ?? 'SILVER';
const PENDING_TOKEN_EXPIRY = '10m';

export type OAuthLoginOutcome =
  | { kind: 'login'; accessToken: string }
  | { kind: 'choose-tenant'; resolutionToken: string; candidates: { tenantId: string; tenantName: string }[] }
  | { kind: 'signup'; oauthSignupToken: string };

interface PendingOAuthPayload extends OAuthValidatedProfile {
  kind: 'oauth-choose-tenant' | 'oauth-signup';
}

/**
 * Implements the decision tree agreed with the user for "someone signs in
 * with Google/Microsoft" (see the approved plan): already-linked account
 * logs in directly; an unlinked but uniquely-matching verified email
 * auto-links (the provider already proved ownership, so this is safe -
 * same trust level as OAuth login anywhere); an email matching 2+ tenants
 * needs a manual pick; no match at all starts the same signup+trial path
 * SignupService uses, skipping the OTP step since the provider already
 * verified the email.
 *
 * The intermediate steps (choose-tenant, complete-signup) don't need a new
 * DB table for "pending OAuth state" - the validated profile just travels
 * as a short-lived (10 min) signed JWT of its own shape (PendingOAuthPayload,
 * not AuthenticatedUser), verified explicitly here rather than by the
 * global JwtAuthGuard.
 */
@Injectable()
export class OAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly tenantProvisioningService: TenantProvisioningService,
  ) {}

  async handleOAuthLogin(profile: OAuthValidatedProfile): Promise<OAuthLoginOutcome> {
    const linked = await this.prisma.$queryRaw<{ tenant_id: string; user_id: string }[]>`
      SELECT tenant_id, user_id FROM find_tenant_by_oauth_account(${profile.provider}, ${profile.providerAccountId})
    `;
    if (linked.length > 0) {
      const accessToken = await this.issueTokenForUser(linked[0].tenant_id, linked[0].user_id);
      return { kind: 'login', accessToken };
    }

    const candidates = await this.findTenantsByEmail(profile.email);

    if (candidates.length === 1) {
      const { tenantId, userId } = candidates[0];
      await this.linkOAuthAccount(tenantId, userId, profile);
      await this.markEmailVerifiedIfNeeded(tenantId, userId);
      const accessToken = await this.issueTokenForUser(tenantId, userId);
      return { kind: 'login', accessToken };
    }

    if (candidates.length > 1) {
      const resolutionToken = await this.signPendingToken('oauth-choose-tenant', profile);
      return {
        kind: 'choose-tenant',
        resolutionToken,
        candidates: candidates.map((c) => ({ tenantId: c.tenantId, tenantName: c.tenantName })),
      };
    }

    const oauthSignupToken = await this.signPendingToken('oauth-signup', profile);
    return { kind: 'signup', oauthSignupToken };
  }

  async chooseTenant(dto: OAuthChooseTenantDto): Promise<{ accessToken: string }> {
    const profile = await this.verifyPendingToken('oauth-choose-tenant', dto.resolutionToken);

    // Re-consulta contra el email verificado del token, no confía en que
    // dto.tenantId venga de la lista que el frontend recibió antes - evita
    // que alguien mande un tenantId ajeno a mano.
    const candidates = await this.findTenantsByEmail(profile.email);
    const match = candidates.find((c) => c.tenantId === dto.tenantId);
    if (!match) {
      throw new UnauthorizedException('Ese tenant no corresponde a este email');
    }

    await this.linkOAuthAccount(match.tenantId, match.userId, profile);
    await this.markEmailVerifiedIfNeeded(match.tenantId, match.userId);
    const accessToken = await this.issueTokenForUser(match.tenantId, match.userId);
    return { accessToken };
  }

  async completeSignup(dto: OAuthCompleteSignupDto): Promise<{ accessToken: string }> {
    const profile = await this.verifyPendingToken('oauth-signup', dto.oauthSignupToken);
    const tenantId = randomUUID();
    // Password real, aleatoria y nunca comunicada - esta cuenta sólo puede
    // entrar por OAuth o por /forgot-password más adelante, nunca por
    // password de entrada porque no la conoce nadie (ni el propio usuario).
    const passwordHash = await bcrypt.hash(randomBytes(24).toString('base64url'), 10);

    const { userId } = await this.tenantProvisioningService.provision({
      tenantId,
      name: dto.tenantName,
      taxId: dto.taxId,
      ownerEmail: profile.email,
      ownerName: profile.name,
      passwordHash,
      mustChangePassword: false,
      // El proveedor ya verificó el email - no hace falta el OTP del
      // signup público (ver SignupService).
      autoVerifyEmail: true,
      planKey: SIGNUP_DEFAULT_PLAN_KEY,
      askBusinessTemplate: true,
    });

    await this.linkOAuthAccount(tenantId, userId, profile);
    const accessToken = await this.issueTokenForUser(tenantId, userId);
    return { accessToken };
  }

  private async findTenantsByEmail(
    email: string,
  ): Promise<{ tenantId: string; userId: string; tenantName: string }[]> {
    const rows = await this.prisma.$queryRaw<{ tenant_id: string; user_id: string; tenant_name: string }[]>`
      SELECT tenant_id, user_id, tenant_name FROM find_tenants_by_email(${email})
    `;
    return rows.map((r) => ({ tenantId: r.tenant_id, userId: r.user_id, tenantName: r.tenant_name }));
  }

  private async linkOAuthAccount(tenantId: string, userId: string, profile: OAuthValidatedProfile): Promise<void> {
    await withTenantContext(this.prisma, tenantId, () =>
      getTenantDb().oAuthAccount.create({
        data: {
          tenantId,
          userId,
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
          email: profile.email,
        },
      }),
    );
  }

  private async markEmailVerifiedIfNeeded(tenantId: string, userId: string): Promise<void> {
    await withTenantContext(this.prisma, tenantId, async () => {
      const db = getTenantDb();
      const user = await db.user.findUnique({ where: { id: userId } });
      if (user && !user.emailVerifiedAt) {
        await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
      }
    });
  }

  private async issueTokenForUser(tenantId: string, userId: string): Promise<string> {
    return withTenantContext(this.prisma, tenantId, async () => {
      const db = getTenantDb();
      const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
      const moduleAccess = await db.userModuleAccess.findMany({ where: { userId } });
      return this.authService.buildAccessToken(user, tenantId, moduleAccess);
    });
  }

  private signPendingToken(kind: PendingOAuthPayload['kind'], profile: OAuthValidatedProfile): Promise<string> {
    const payload: PendingOAuthPayload = { kind, ...profile };
    return this.jwtService.signAsync(payload, { expiresIn: PENDING_TOKEN_EXPIRY });
  }

  private async verifyPendingToken(
    kind: PendingOAuthPayload['kind'],
    token: string,
  ): Promise<OAuthValidatedProfile> {
    let payload: PendingOAuthPayload;
    try {
      payload = await this.jwtService.verifyAsync<PendingOAuthPayload>(token);
    } catch {
      throw new UnauthorizedException('El link expiró, volvé a intentar el ingreso con OAuth');
    }
    if (payload.kind !== kind) {
      throw new UnauthorizedException('Token inválido para esta operación');
    }
    return payload;
  }
}
