import { api } from '@/lib/api';

export interface LoginPayload {
  tenantId: string;
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface TenantCandidate {
  tenantId: string;
  tenantName: string;
}

export async function resolveTenant(email: string): Promise<TenantCandidate[]> {
  const res = await api.post<{ candidates: TenantCandidate[] }>('/auth/resolve-tenant', { email });
  return res.data.candidates;
}

export async function login(payload: LoginPayload): Promise<{ accessToken: string }> {
  const res = await api.post<{ accessToken: string }>('/auth/login', payload);
  return res.data;
}

export interface SignupPayload {
  tenantName: string;
  taxId?: string;
  ownerName?: string;
  email: string;
  password: string;
  // Casilla obligatoria del contrato de uso (la API registra la aceptación).
  acceptTerms: boolean;
}

export async function signup(payload: SignupPayload): Promise<{ tenantId: string; email: string }> {
  const res = await api.post<{ tenantId: string; email: string }>('/auth/signup', payload);
  return res.data;
}

export async function verifyEmail(input: {
  tenantId: string;
  email: string;
  code: string;
}): Promise<{ accessToken: string }> {
  const res = await api.post<{ accessToken: string }>('/auth/verify-email', input);
  return res.data;
}

export async function resendCode(input: { tenantId: string; email: string }): Promise<{ ok: true }> {
  const res = await api.post<{ ok: true }>('/auth/resend-code', input);
  return res.data;
}

export async function forgotPassword(email: string): Promise<{ ok: true }> {
  const res = await api.post<{ ok: true }>('/auth/forgot-password', { email });
  return res.data;
}

export async function resetPassword(input: {
  tenantId: string;
  token: string;
  newPassword: string;
}): Promise<void> {
  await api.post('/auth/reset-password', input);
}

export interface OAuthProvidersStatus {
  google: boolean;
  microsoft: boolean;
  apple: boolean;
}

export async function getOAuthProviders(): Promise<OAuthProvidersStatus> {
  const res = await api.get<OAuthProvidersStatus>('/auth/oauth/providers');
  return res.data;
}

export async function oauthChooseTenant(input: {
  resolutionToken: string;
  tenantId: string;
}): Promise<{ accessToken: string }> {
  const res = await api.post<{ accessToken: string }>('/auth/oauth/choose-tenant', input);
  return res.data;
}

export async function oauthCompleteSignup(input: {
  oauthSignupToken: string;
  tenantName: string;
  taxId?: string;
}): Promise<{ accessToken: string }> {
  const res = await api.post<{ accessToken: string }>('/auth/oauth/complete-signup', input);
  return res.data;
}

// EMAIL_NOT_VERIFIED is the one structured error code the API returns today
// (see EmailNotVerifiedError in AuthService.login) - a small typed helper
// beats re-parsing err.response.data.code inline at every call site.
export interface AuthErrorBody {
  code?: string;
  message?: string;
  tenantId?: string;
  email?: string;
}

export function getAuthErrorBody(err: unknown): AuthErrorBody | null {
  const body = (err as { response?: { data?: unknown } })?.response?.data;
  return body && typeof body === 'object' ? (body as AuthErrorBody) : null;
}
