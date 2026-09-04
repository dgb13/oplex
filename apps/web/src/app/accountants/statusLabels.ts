import type { MembershipStatus } from '@/lib/memberships';

export const STATUS_LABELS: Record<MembershipStatus, string> = {
  PENDING: 'Pendiente',
  ACCEPTED: 'Activa',
  DECLINED: 'Rechazada',
  REVOKED: 'Revocada',
};

export const STATUS_COLORS: Record<MembershipStatus, string> = {
  PENDING: 'bg-amber-900/50 text-amber-300',
  ACCEPTED: 'bg-green-900/50 text-green-300',
  DECLINED: 'bg-slate-700/50 text-slate-400',
  REVOKED: 'bg-red-900/50 text-red-300',
};

export function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string | string[] } } } | undefined)?.response?.data
    ?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}
