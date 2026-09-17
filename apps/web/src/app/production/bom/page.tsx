'use client';

import ArticlePicker, { type ArticlePickerOption } from '@/components/ArticlePicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { buildArticleVariantLookup, inventoryApi, resolveUploadUrl } from '@/lib/inventory';
import { productionApi, type BomAttachment, type CreateBomLineInput } from '@/lib/production';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import {
  AlertCircle,
  ChefHat,
  FileArchive,
  FileText,
  Hash,
  Layers,
  Package,
  Paperclip,
  Percent,
  Plus,
  Ruler,
  Save,
  Scissors,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ProductionPlanGateBanner, useProductionGate } from '../ProductionPlanGate';

interface LineDraft {
  inputArticleVariantId: string;
  quantity: string;
  length: string;
  width: string;
  cutsCount: string;
  expectedWastePercent: string;
}

function emptyLine(): LineDraft {
  return { inputArticleVariantId: '', quantity: '', length: '', width: '', cutsCount: '', expectedWastePercent: '' };
}

function ThumbOrIcon({ imageUrl, icon: Icon }: { imageUrl?: string | null; icon: typeof Package }) {
  const src = imageUrl ? resolveUploadUrl(imageUrl) : null;
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <Icon className="h-5 w-5" />}
    </div>
  );
}

function NumberField({
  label,
  icon: Icon,
  value,
  onChange,
  className,
}: {
  label: string;
  icon: typeof Hash;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${className ?? ''}`}>
      <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </label>
      <Input type="number" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Documentación (PDF/ZIP) de esta versión puntual de receta - sólo tiene
 * sentido una vez que la receta existe de verdad (bomId real), por eso
 * `bom/page.tsx` sólo la muestra cuando `bomQuery.data` está cargado, no
 * mientras se está armando una receta nueva todavía sin guardar. */
function BomAttachmentsCard({ bomId, version }: { bomId: string; version: number }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const attachmentsQuery = useQuery({
    queryKey: ['production-bom-attachments', bomId],
    queryFn: () => productionApi.listBomAttachments(bomId),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['production-bom-attachments', bomId] });
  }

  const uploadMutation = useMutation({
    mutationFn: (file: File) => productionApi.uploadBomAttachment(bomId, file),
    onSuccess: () => {
      setError('');
      invalidate();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo subir el archivo';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) => productionApi.deleteBomAttachment(attachmentId),
    onSuccess: invalidate,
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    uploadMutation.mutate(file);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Paperclip className="h-4 w-4" /> Documentación
          <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300">v{version}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          Planos, hojas de corte, etc. en PDF o ZIP (hasta 20MB) - quedan asociados a esta versión, no se copian si
          guardás una nueva.
        </p>

        {(attachmentsQuery.data?.length ?? 0) > 0 && (
          <ul className="flex flex-col gap-1.5">
            {attachmentsQuery.data?.map((att: BomAttachment) => (
              <li
                key={att.id}
                className="flex items-center gap-2.5 rounded-lg border bg-muted/20 px-3 py-2 text-sm"
              >
                {att.fileType === 'PDF' ? (
                  <FileText className="h-4 w-4 shrink-0 text-red-500" />
                ) : (
                  <FileArchive className="h-4 w-4 shrink-0 text-amber-600" />
                )}
                <a
                  href={resolveUploadUrl(att.fileUrl) ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate font-medium text-primary hover:underline"
                >
                  {att.fileName}
                </a>
                <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(att.fileSizeBytes)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Eliminar adjunto"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteMutation.mutate(att.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {error}
          </p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.zip"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit border-dashed"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          <Upload className="h-3.5 w-3.5" /> {uploadMutation.isPending ? 'Subiendo...' : 'Subir archivo'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function BomPage() {
  const gate = useProductionGate();
  const queryClient = useQueryClient();
  const [outputArticleVariantId, setOutputArticleVariantId] = useState('');
  const [outputOption, setOutputOption] = useState<ArticlePickerOption | null>(null);
  const [name, setName] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [error, setError] = useState('');

  const articlesQuery = useQuery({
    queryKey: ['inventory-articles'],
    queryFn: () => inventoryApi.listArticles(),
    enabled: gate.enabled,
  });
  const lookup = useMemo(() => buildArticleVariantLookup(articlesQuery.data ?? []), [articlesQuery.data]);

  const bomQuery = useQuery({
    queryKey: ['production-bom', outputArticleVariantId],
    queryFn: () => productionApi.getBom(outputArticleVariantId),
    enabled: gate.enabled && !!outputArticleVariantId,
    retry: false,
  });

  // Al elegir un producto con receta activa, se precarga como punto de
  // partida para la nueva versión (BomService.create SIEMPRE crea una
  // versión nueva, nunca pisa la existente - ver el service). Un producto
  // sin receta arranca con una sola línea vacía.
  useEffect(() => {
    if (bomQuery.data) {
      setName(bomQuery.data.name);
      setLines(
        bomQuery.data.lines.map((l) => ({
          inputArticleVariantId: l.inputArticleVariantId,
          quantity: l.quantity,
          length: l.length ?? '',
          width: l.width ?? '',
          cutsCount: l.cutsCount != null ? String(l.cutsCount) : '',
          expectedWastePercent: l.expectedWastePercent !== '0' ? l.expectedWastePercent : '',
        })),
      );
    } else if (bomQuery.isError) {
      setName('');
      setLines([emptyLine()]);
    }
  }, [bomQuery.data, bomQuery.isError]);

  const mutation = useMutation({
    mutationFn: () => {
      const parsedLines: CreateBomLineInput[] = lines
        .filter((l) => l.inputArticleVariantId && l.quantity)
        .map((l) => ({
          inputArticleVariantId: l.inputArticleVariantId,
          quantity: Number(l.quantity),
          length: l.length ? Number(l.length) : undefined,
          width: l.width ? Number(l.width) : undefined,
          cutsCount: l.cutsCount ? Number(l.cutsCount) : undefined,
          expectedWastePercent: l.expectedWastePercent ? Number(l.expectedWastePercent) : undefined,
        }));
      return productionApi.createBom({ outputArticleVariantId, name: name.trim(), lines: parsedLines });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['production-bom', outputArticleVariantId] });
      setError('');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo guardar la receta';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Ingresá un nombre para la receta');
      return;
    }
    const validLines = lines.filter((l) => l.inputArticleVariantId && l.quantity);
    if (validLines.length === 0) {
      setError('Agregá al menos un insumo con cantidad');
      return;
    }
    mutation.mutate();
  }

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  // Limpia el error apenas el usuario corrige lo que lo disparó, en vez de
  // dejarlo pegado en pantalla hasta el próximo submit (confundía durante
  // las pruebas manuales).
  useEffect(() => {
    if (!error) return;
    if (name.trim() && lines.some((l) => l.inputArticleVariantId && l.quantity)) {
      setError('');
    }
  }, [name, lines, error]);

  if (gate.isLoading) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <ChefHat className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Recetas de producción</h1>
      </div>

      {!gate.enabled ? (
        <ProductionPlanGateBanner planName={gate.planName} />
      ) : (
        <>
          <Card className="max-w-lg">
            <CardContent className="flex items-center gap-3">
              <ThumbOrIcon imageUrl={outputOption?.imageUrl} icon={Package} />
              <div className="flex-1">
                <label className="text-sm text-muted-foreground">Producto a fabricar</label>
                <ArticlePicker
                  value={outputArticleVariantId}
                  onChange={(id, option) => {
                    setOutputArticleVariantId(id);
                    setOutputOption(option);
                  }}
                  placeholder="Buscar producto..."
                  className="mt-1"
                  filter={(o) => o.isManufactured}
                />
              </div>
            </CardContent>
          </Card>

          {outputArticleVariantId && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  {bomQuery.data ? (
                    <>
                      <Layers className="h-4 w-4" /> Receta activa
                      <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300">
                        v{bomQuery.data.version}
                      </Badge>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Nueva receta
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-muted-foreground">Nombre de la receta</label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="p. ej. Tablero eléctrico armado"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Package className="h-3.5 w-3.5" /> Insumos
                      <span className="text-xs">(largo/ancho/cortes sólo hacen falta para artículos por metro o por pieza)</span>
                    </p>
                    {lines.map((line, i) => {
                      const article = lookup[line.inputArticleVariantId];
                      const isPiece = line.length !== '' || line.width !== '' || line.cutsCount !== '';
                      return (
                        <div
                          key={i}
                          className="flex flex-wrap items-start gap-3 rounded-xl border bg-muted/20 p-3 transition hover:bg-muted/40"
                        >
                          <ThumbOrIcon imageUrl={undefined} icon={isPiece ? Ruler : Package} />
                          <div className="min-w-[220px] flex-1">
                            <ArticlePicker
                              value={line.inputArticleVariantId}
                              onChange={(id) => updateLine(i, { inputArticleVariantId: id })}
                              placeholder="Insumo..."
                            />
                            {article && line.inputArticleVariantId && (
                              <p className="mt-1 text-[11px] text-muted-foreground">SKU {article.sku}</p>
                            )}
                          </div>

                          <NumberField
                            label="Cantidad"
                            icon={Hash}
                            value={line.quantity}
                            onChange={(v) => updateLine(i, { quantity: v })}
                            className="w-20"
                          />
                          <NumberField
                            label="Largo (mm)"
                            icon={Ruler}
                            value={line.length}
                            onChange={(v) => updateLine(i, { length: v })}
                            className="w-20"
                          />
                          <NumberField
                            label="Ancho (mm)"
                            icon={Ruler}
                            value={line.width}
                            onChange={(v) => updateLine(i, { width: v })}
                            className="w-20"
                          />
                          <NumberField
                            label="Cortes"
                            icon={Scissors}
                            value={line.cutsCount}
                            onChange={(v) => updateLine(i, { cutsCount: v })}
                            className="w-16"
                          />
                          <NumberField
                            label="Merma %"
                            icon={Percent}
                            value={line.expectedWastePercent}
                            onChange={(v) => updateLine(i, { expectedWastePercent: v })}
                            className="w-16"
                          />

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Quitar insumo"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-dashed"
                      onClick={() => setLines((prev) => [...prev, emptyLine()])}
                    >
                      <Plus className="h-3.5 w-3.5" /> Agregar insumo
                    </Button>
                  </div>

                  {error && (
                    <p className="flex items-center gap-1.5 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4" /> {error}
                    </p>
                  )}

                  <div className="flex justify-end">
                    <Button type="submit" disabled={mutation.isPending}>
                      <Save className="h-4 w-4" />
                      {mutation.isPending
                        ? 'Guardando...'
                        : bomQuery.data
                          ? 'Guardar como nueva versión'
                          : 'Crear receta'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {bomQuery.data && <BomAttachmentsCard bomId={bomQuery.data.id} version={bomQuery.data.version} />}
        </>
      )}
    </div>
  );
}
