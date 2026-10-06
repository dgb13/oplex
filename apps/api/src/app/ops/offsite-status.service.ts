import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';

interface RcloneSize {
  count: number;
  bytes: number;
}

export interface OffsiteDump {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface OffsiteRun {
  at: string;
  ok: boolean;
  error: string | null;
  durationSec: number;
  dump: string;
  uploadedDumps: number;
  uploadedFiles: number;
  movedFiles: number;
}

export interface OffsiteStatus {
  /** false = este servidor no tiene la copia a R2 armada (o todavía no corrió nunca). */
  configured: boolean;
  ok: boolean | null;
  error: string | null;
  finishedAt: string | null;
  durationSec: number | null;
  keepDays: number | null;
  lastSuccessAt: string | null;
  /** Lo que había en R2 en la última corrida buena (null si la última falló). */
  dumps: OffsiteDump[] | null;
  files: RcloneSize | null;
  deletedFiles: RcloneSize | null;
  bucketBytes: number | null;
  runs: OffsiteRun[];
}

const EMPTY: OffsiteStatus = {
  configured: false,
  ok: null,
  error: null,
  finishedAt: null,
  durationSec: null,
  keepDays: null,
  lastSuccessAt: null,
  dumps: null,
  files: null,
  deletedFiles: null,
  bucketBytes: null,
  runs: [],
};

/**
 * Lee lo que deja docker/offsite-backup.sh en OFFSITE_DIR (status.json e
 * history.jsonl). La API nunca habla con R2 ni tiene sus credenciales: el
 * script, que sí las tiene, informa nombres ya descifrados y tamaños.
 */
@Injectable()
export class OffsiteStatusService {
  async read(): Promise<OffsiteStatus> {
    const dir = process.env['OFFSITE_DIR'];
    if (!dir) return EMPTY;

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(await readFile(join(dir, 'status.json'), 'utf8'));
    } catch {
      return EMPTY;
    }

    const base = Array.isArray(raw['base']) ? (raw['base'] as Array<Record<string, unknown>>) : null;
    const size = (value: unknown): RcloneSize | null =>
      value && typeof value === 'object'
        ? { count: Number((value as RcloneSize).count) || 0, bytes: Number((value as RcloneSize).bytes) || 0 }
        : null;

    return {
      configured: true,
      ok: raw['ok'] === true,
      error: typeof raw['error'] === 'string' && raw['error'] ? (raw['error'] as string) : null,
      finishedAt: (raw['finishedAt'] as string) || null,
      durationSec: typeof raw['durationSec'] === 'number' ? raw['durationSec'] : null,
      keepDays: typeof raw['keepDays'] === 'number' ? raw['keepDays'] : null,
      lastSuccessAt: (raw['lastSuccessAt'] as string) || null,
      dumps: base
        ? base
            .map((d) => ({ name: String(d['Name']), sizeBytes: Number(d['Size']) || 0, modifiedAt: String(d['ModTime']) }))
            .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
        : null,
      files: size(raw['archivos']),
      deletedFiles: size(raw['borrados']),
      bucketBytes: size(raw['bucket'])?.bytes ?? null,
      runs: await this.readRuns(dir),
    };
  }

  private async readRuns(dir: string): Promise<OffsiteRun[]> {
    let text: string;
    try {
      text = await readFile(join(dir, 'history.jsonl'), 'utf8');
    } catch {
      return [];
    }
    const runs: OffsiteRun[] = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        runs.push({
          at: String(r.at),
          ok: r.ok === true,
          error: r.error ? String(r.error) : null,
          durationSec: Number(r.durationSec) || 0,
          dump: String(r.dump ?? ''),
          uploadedDumps: Number(r.uploadedDumps) || 0,
          uploadedFiles: Number(r.uploadedFiles) || 0,
          movedFiles: Number(r.movedFiles) || 0,
        });
      } catch {
        // Una línea cortada (p. ej. disco lleno) no rompe el resto.
      }
    }
    return runs.reverse();
  }
}
