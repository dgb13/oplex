'use client';

import { resolveUploadUrl } from '@/lib/inventory';
import type { PurchaseOrderSummary } from '@/lib/purchases';
import { Mail, MessageCircle } from 'lucide-react';

interface Props {
  order: PurchaseOrderSummary;
  onResend: () => void;
  onFollowUp: () => void;
}

/** Icon-only replacement for the old "Email"/"WhatsApp" text in the
 * "Enviada vía" column - the hover card carries the detail that used to
 * have no home at all (exact send time, who it actually went to) plus a
 * shortcut to resend, instead of forcing a trip through "Ver". */
export default function SentViaBadge({ order, onResend, onFollowUp }: Props) {
  if (!order.sentVia || !order.sentAt) {
    return <span className="text-muted-foreground">—</span>;
  }

  const isEmail = order.sentVia === 'EMAIL';
  const Icon = isEmail ? Mail : MessageCircle;
  const avatarUrl = !isEmail ? resolveUploadUrl(order.sentToContactAvatarUrl) : null;
  const sentAtLabel = new Date(order.sentAt).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
  const recipient = isEmail
    ? order.sentToEmail
    : [order.sentToContactName, order.sentToPhone].filter(Boolean).join(' — ') || null;

  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        onClick={onFollowUp}
        title="Mandar un mensaje rápido de seguimiento"
        className="inline-flex cursor-pointer"
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            title={order.sentToContactName ?? undefined}
            className="h-4 w-4 rounded-full border border-green-500 object-cover"
          />
        ) : (
          <Icon
            className={
              isEmail
                ? 'h-4 w-4 text-primary'
                : 'h-4 w-4 text-green-600 dark:text-green-400'
            }
          />
        )}
      </button>
      <div className="invisible absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-lg border bg-card p-3 text-left text-xs opacity-0 shadow-xl transition pointer-events-none group-hover:visible group-hover:opacity-100 group-hover:pointer-events-auto">
        <p className="font-medium">Enviada por {isEmail ? 'Email' : 'WhatsApp'}</p>
        <p className="mt-1 text-muted-foreground">{sentAtLabel}</p>
        <div className="mt-1 flex items-center gap-2 text-muted-foreground">
          {avatarUrl && <img src={avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" />}
          <span>A: {recipient ?? 'No registrado (envío previo a esta función)'}</span>
        </div>
        <div className="mt-2 flex flex-col gap-1 border-t pt-2">
          <button
            type="button"
            onClick={onFollowUp}
            className="text-left text-primary hover:text-primary"
          >
            Mensaje rápido
          </button>
          <button
            type="button"
            onClick={onResend}
            className="text-left text-primary hover:text-primary"
          >
            Reenviar (email o WhatsApp)
          </button>
        </div>
      </div>
    </div>
  );
}
