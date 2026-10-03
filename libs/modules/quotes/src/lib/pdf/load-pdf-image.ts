import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { QuotePdfImage } from './pdf-data.js';

const UPLOADS_ROOT = resolve(process.cwd(), 'uploads');

/** Lee una imagen subida a Oplex (`/uploads/...`) para meterla en el PDF.
 * Sólo PNG/JPG (lo único que dibuja @react-pdf/renderer) y sólo dentro de
 * `uploads/`. Cualquier problema devuelve null: una imagen que falta nunca
 * impide generar el presupuesto. */
export async function loadPdfImage(url: string | null | undefined): Promise<QuotePdfImage | null> {
  if (!url || !url.startsWith('/uploads/')) return null;
  const lower = url.toLowerCase();
  const format = lower.endsWith('.png') ? 'png' : lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? 'jpg' : null;
  if (!format) return null;

  const path = resolve(join(UPLOADS_ROOT, url.slice('/uploads/'.length)));
  if (!path.startsWith(UPLOADS_ROOT + sep)) return null;
  try {
    return { data: await readFile(path), format };
  } catch {
    return null;
  }
}
