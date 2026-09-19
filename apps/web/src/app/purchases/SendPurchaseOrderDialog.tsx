'use client';

import { NewPersonForm } from '@/components/CompanyDetailModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { companiesApi } from '@/lib/companies';
import { resolveUploadUrl } from '@/lib/inventory';
import { purchaseOrdersApi } from '@/lib/purchases';
import { initials } from '@/lib/profile';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Building2, Mail, MessageCircle, UserPlus } from 'lucide-react';
import { useState } from 'react';

interface Props {
  purchaseOrder: { id: string; number: string; supplierId: string; supplierName: string; supplierEmail: string | null };
  onClose: () => void;
}

interface Target {
  key: string;
  name: string;
  jobTitle: string | null;
  avatarUrl: string | null;
  email: string | null;
  whatsapp: string | null;
}

/** Shown right after "Emitir Orden de Compra" (or manually from la OC
 * detail panel para una DRAFT todavía sin enviar) - a quién se la
 * enviamos (grilla de contactos + casilla institucional, con avatar,
 * ver Person.avatarUrl/Company.logoUrl) y por qué canal, o sólo
 * guardarla. Misma query key que CompanyDetailModal (['company', id]) a
 * propósito - así "+ agregar contacto"/el email institucional que se
 * cargan acá quedan disponibles ahí también sin duplicar el fetch. */
export default function SendPurchaseOrderDialog({ purchaseOrder, onClose }: Props) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [addingContact, setAddingContact] = useState(false);
  const [editingInstitutionalEmail, setEditingInstitutionalEmail] = useState(false);
  const [institutionalEmailDraft, setInstitutionalEmailDraft] = useState('');

  const { data: supplier } = useQuery({
    queryKey: ['company', purchaseOrder.supplierId],
    queryFn: () => companiesApi.get(purchaseOrder.supplierId),
  });

  const institutionalTarget: Target | null = supplier?.email
    ? {
        key: 'institutional',
        name: 'Casilla institucional',
        jobTitle: null,
        avatarUrl: resolveUploadUrl(supplier.logoUrl),
        email: supplier.email,
        whatsapp: null,
      }
    : null;
  const contactTargets: Target[] = (supplier?.people ?? []).map((p) => ({
    key: p.id,
    name: `${p.firstName} ${p.lastName ?? ''}`.trim(),
    jobTitle: p.jobTitle,
    avatarUrl: resolveUploadUrl(p.avatarUrl),
    email: p.email,
    whatsapp: p.whatsapp,
  }));
  const targets = institutionalTarget ? [institutionalTarget, ...contactTargets] : contactTargets;

  const selected =
    targets.find((t) => t.key === selectedKey) ?? targets.find((t) => t.email || t.whatsapp) ?? targets[0];

  function invalidateAndReport(message: string) {
    void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    void queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
    setError('');
    setDone(message);
  }

  const institutionalEmailMutation = useMutation({
    mutationFn: () => companiesApi.update(purchaseOrder.supplierId, { email: institutionalEmailDraft.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['company', purchaseOrder.supplierId] });
      setEditingInstitutionalEmail(false);
      setInstitutionalEmailDraft('');
    },
  });

  const emailMutation = useMutation({
    mutationFn: () =>
      purchaseOrdersApi.sendEmail(
        purchaseOrder.id,
        selected?.key === 'institutional'
          ? undefined
          : { to: selected?.email ?? undefined, contactName: selected?.name, contactAvatarUrl: selected?.avatarUrl ?? undefined },
      ),
    onSuccess: () => invalidateAndReport(`Enviado por email a ${selected?.name}`),
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo enviar el email';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const whatsappMutation = useMutation({
    mutationFn: async () => {
      const phone = selected?.whatsapp ?? '';
      const { url } = await purchaseOrdersApi.whatsappLink(purchaseOrder.id, phone);
      window.open(url, '_blank');
      return purchaseOrdersApi.markSentWhatsapp(
        purchaseOrder.id,
        phone,
        selected?.name,
        selected?.avatarUrl ?? undefined,
      );
    },
    onSuccess: () => invalidateAndReport(`Abrimos WhatsApp con el mensaje listo para ${selected?.name}`),
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo armar el link de WhatsApp';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-card p-6 shadow-2xl">
        <h2 className="mb-1 text-lg font-semibold">
          Orden de Compra {purchaseOrder.number} creada
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          ¿Se la enviamos a {purchaseOrder.supplierName} ahora, o preferís sólo guardarla?
        </p>

        {targets.length === 0 ? (
          <p className="mb-3 text-sm text-amber-600 dark:text-amber-400">
            Este proveedor no tiene email institucional ni contactos cargados - agregá uno para poder enviarla.
          </p>
        ) : (
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {targets.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setSelectedKey(t.key)}
                className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition ${
                  selected?.key === t.key ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                }`}
              >
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border bg-muted text-xs font-medium">
                  {t.avatarUrl ? (
                    <img src={t.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : t.key === 'institutional' ? (
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    initials(t.name, t.email ?? t.name)
                  )}
                </div>
                <div className="w-full">
                  <p className="truncate text-xs font-medium">{t.name}</p>
                  {t.jobTitle && <p className="truncate text-[10px] text-muted-foreground">{t.jobTitle}</p>}
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Mail className={`h-3 w-3 ${t.email ? 'text-foreground' : 'opacity-25'}`} />
                  <MessageCircle className={`h-3 w-3 ${t.whatsapp ? 'text-foreground' : 'opacity-25'}`} />
                </div>
              </button>
            ))}
          </div>
        )}

        {!institutionalTarget &&
          (editingInstitutionalEmail ? (
            <div className="mb-3 flex items-center gap-2">
              <Input
                type="email"
                placeholder="email@proveedor.com"
                value={institutionalEmailDraft}
                onChange={(e) => setInstitutionalEmailDraft(e.target.value)}
                className="h-8"
              />
              <Button
                size="sm"
                onClick={() => institutionalEmailMutation.mutate()}
                disabled={!institutionalEmailDraft.trim() || institutionalEmailMutation.isPending}
              >
                Guardar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingInstitutionalEmail(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingInstitutionalEmail(true)}
              className="mb-3 flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Mail className="h-3.5 w-3.5" /> + agregar email institucional
            </button>
          ))}

        {addingContact ? (
          <div className="mb-4">
            <NewPersonForm companyId={purchaseOrder.supplierId} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingContact(true)}
            className="mb-4 flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <UserPlus className="h-3.5 w-3.5" /> + agregar contacto (vendedor, comprador...)
          </button>
        )}

        <div className="flex flex-col gap-3 border-t pt-4">
          <button
            type="button"
            disabled={!selected?.email || emailMutation.isPending}
            onClick={() => emailMutation.mutate()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            title={selected?.email ?? 'Este contacto no tiene email cargado'}
          >
            {emailMutation.isPending ? 'Enviando...' : `Enviar por Email${selected ? ` a ${selected.name}` : ''}`}
          </button>

          <button
            type="button"
            disabled={!selected?.whatsapp || whatsappMutation.isPending}
            onClick={() => whatsappMutation.mutate()}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500 disabled:opacity-50"
            title={selected?.whatsapp ?? 'Este contacto no tiene WhatsApp cargado'}
          >
            {whatsappMutation.isPending ? 'Abriendo...' : `Enviar por WhatsApp${selected ? ` a ${selected.name}` : ''}`}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm transition hover:bg-muted"
          >
            Sólo guardar (no enviar ahora)
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {done && (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-sm text-green-600 dark:text-green-400">{done}</p>
            <button
              type="button"
              onClick={onClose}
              className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
