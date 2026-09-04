import axios from 'axios';

// process.env.NEXT_PUBLIC_API_BASE_URL isn't set in this repo's .env today
// (see .env.example) - the hardcoded localhost fallback keeps every
// existing dev setup working unchanged. Exported (not just used internally)
// because OAuthButtons needs the real origin for a plain <a href> full
// navigation, where axios's own baseURL doesn't help.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';

export const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Every pre-auth endpoint under /auth - login, signup, verify-email,
// resend-code, resolve-tenant, forgot-password, reset-password, and the
// oauth/* routes - can legitimately 401 as part of its own normal
// validation (wrong password, wrong OTP, expired reset token, etc.), with
// no token involved yet. None of that should trigger the "your session
// expired" redirect below - each of those pages already renders its own
// inline error for its own 401. /users/invitations/accept is the same case
// (invalid/expired invitation link) even though it doesn't live under /auth.
const PUBLIC_AUTH_PATHS = [
  '/auth/login',
  '/auth/signup',
  '/auth/verify-email',
  '/auth/resend-code',
  '/auth/resolve-tenant',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/oauth/',
  '/users/invitations/accept',
];

function isPublicAuthRequest(url: unknown): boolean {
  return typeof url === 'string' && PUBLIC_AUTH_PATHS.some((path) => url.includes(path));
}

// A 401 means the current token no longer works - either a normal session
// expired, a 15-minute impersonation token did (see lib/impersonation.ts),
// or a membership session token did (see lib/membership-session.ts, same
// swap mechanism, own storage keys). window.location.assign() rather than
// a Next router: this file isn't a component, has no router/QueryClient to
// reach, and a full navigation clears every in-memory cache (React Query
// included) on its own, no queryClient.clear() needed here.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== 'undefined' && error?.response?.status === 401 && !isPublicAuthRequest(error?.config?.url)) {
      const adminToken = localStorage.getItem('adminToken');
      const membershipHomeToken = localStorage.getItem('membershipHomeToken');
      if (adminToken) {
        localStorage.setItem('token', adminToken);
        localStorage.removeItem('adminToken');
        localStorage.removeItem('impersonationExpiresAt');
        window.location.assign('/admin');
      } else if (membershipHomeToken) {
        localStorage.setItem('token', membershipHomeToken);
        localStorage.removeItem('membershipHomeToken');
        localStorage.removeItem('membershipExpiresAt');
        localStorage.removeItem('membershipClientName');
        window.location.assign('/accountants');
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('tenantId');
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);
