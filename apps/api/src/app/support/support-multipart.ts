import { BadRequestException } from '@nestjs/common';
import '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import { cleanFileName, MAX_SUPPORT_FILES, type IncomingSupportFile } from './support-files.js';

/**
 * Lee un formulario multipart de soporte: campos de texto + hasta 5
 * archivos ("files"). Se valida tipo/peso después, en validateSupportFiles.
 */
export async function readSupportForm(
  req: FastifyRequest,
): Promise<{ fields: Record<string, string>; files: IncomingSupportFile[] }> {
  if (!req.isMultipart()) {
    throw new BadRequestException('Formulario inválido');
  }
  const fields: Record<string, string> = {};
  const files: IncomingSupportFile[] = [];
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      if (files.length >= MAX_SUPPORT_FILES) {
        // Igual hay que consumir el stream para que el request termine.
        await part.toBuffer();
        throw new BadRequestException(`Podés adjuntar hasta ${MAX_SUPPORT_FILES} archivos.`);
      }
      files.push({ fileName: cleanFileName(part.filename), mimeType: part.mimetype, buffer: await part.toBuffer() });
    } else {
      fields[part.fieldname] = String(part.value ?? '');
    }
  }
  return { fields, files };
}

/** Datos técnicos que manda el navegador (si el usuario lo autorizó):
 * sólo pares texto/número, chicos. Cualquier otra cosa se descarta. */
export function parseSupportContext(raw: string | undefined): Record<string, string> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed).slice(0, 12)) {
      if (typeof v === 'string' || typeof v === 'number') out[k.slice(0, 40)] = String(v).slice(0, 300);
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}
