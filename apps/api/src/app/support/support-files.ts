import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Capturas de las consultas de soporte. Viven en uploads/support/ (el
 * volumen que ya se respalda a R2), pero main.ts excluye esta carpeta del
 * /uploads/ público: pueden mostrar datos del cliente, así que sólo se
 * bajan con sesión, por SupportController / AdminSupportController.
 */
export const SUPPORT_FILES_DIR = join(process.cwd(), 'uploads', 'support');

export const MAX_SUPPORT_FILES = 5;
export const MAX_SUPPORT_FILE_BYTES = 5 * 1024 * 1024;

const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

export interface IncomingSupportFile {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

export function validateSupportFiles(files: IncomingSupportFile[]): void {
  if (files.length > MAX_SUPPORT_FILES) {
    throw new BadRequestException(`Podés adjuntar hasta ${MAX_SUPPORT_FILES} archivos.`);
  }
  for (const f of files) {
    if (!ALLOWED[f.mimeType]) {
      throw new BadRequestException(`"${f.fileName}" no es una imagen ni un PDF. Adjuntá capturas (PNG, JPG) o PDF.`);
    }
    if (f.buffer.length > MAX_SUPPORT_FILE_BYTES) {
      throw new BadRequestException(`"${f.fileName}" pesa más de 5 MB.`);
    }
  }
}

/** Guarda el archivo con nombre aleatorio y devuelve la clave para la base. */
export async function storeSupportFile(tenantId: string, file: IncomingSupportFile): Promise<string> {
  const dir = join(SUPPORT_FILES_DIR, tenantId);
  mkdirSync(dir, { recursive: true });
  const key = `${tenantId}/${randomUUID()}.${ALLOWED[file.mimeType]}`;
  await writeFile(join(SUPPORT_FILES_DIR, key), file.buffer);
  return key;
}

export function readSupportFile(storageKey: string): Promise<Buffer> {
  // La clave sale siempre de la base (nunca del request), igual se valida.
  if (!/^[\w-]+\/[0-9a-f-]{36}\.[a-z]+$/.test(storageKey)) {
    throw new BadRequestException('Archivo inválido');
  }
  return readFile(join(SUPPORT_FILES_DIR, storageKey));
}

/** Nombre seguro para mostrar/descargar: sin rutas ni caracteres raros. */
export function cleanFileName(name: string | undefined): string {
  const base = (name ?? 'archivo').split(/[\\/]/).pop() ?? 'archivo';
  return base.replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, '_').slice(0, 120) || 'archivo';
}
