import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OffsiteStatusService } from './offsite-status.service.js';

// Formato real que escribe docker/offsite-backup.sh (probado contra rclone).
const STATUS_OK = JSON.stringify({
  ok: true,
  error: '',
  finishedAt: '2026-10-06T05:54:28Z',
  durationSec: 1,
  keepDays: 15,
  lastDump: 'plexo-backup-2.dump',
  lastSuccessAt: '2026-10-06T05:54:28Z',
  lastSuccessEpoch: 1791266068,
  base: [
    { Path: 'plexo-backup-1.dump', Name: 'plexo-backup-1.dump', Size: 6, ModTime: '2026-10-05T02:00:00Z', IsDir: false },
    { Path: 'plexo-backup-2.dump', Name: 'plexo-backup-2.dump', Size: 7, ModTime: '2026-10-06T02:00:00Z', IsDir: false },
  ],
  archivos: { count: 2, bytes: 7, sizeless: 0 },
  borrados: { count: 1, bytes: 4, sizeless: 0 },
  bucket: { count: 5, bytes: 263, sizeless: 0 },
});

describe('OffsiteStatusService', () => {
  const originalEnv = { ...process.env };
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'offsite-'));
    process.env['OFFSITE_DIR'] = dir;
  });
  afterEach(async () => {
    process.env = { ...originalEnv };
    await rm(dir, { recursive: true, force: true });
  });

  it('sin status.json informa que no está armado', async () => {
    const status = await new OffsiteStatusService().read();
    expect(status.configured).toBe(false);
  });

  it('lee el estado y las copias, de la más nueva a la más vieja', async () => {
    await writeFile(join(dir, 'status.json'), STATUS_OK);
    const status = await new OffsiteStatusService().read();
    expect(status).toEqual(
      expect.objectContaining({ configured: true, ok: true, error: null, keepDays: 15, bucketBytes: 263 }),
    );
    expect(status.dumps?.map((d) => d.name)).toEqual(['plexo-backup-2.dump', 'plexo-backup-1.dump']);
    expect(status.files).toEqual({ count: 2, bytes: 7 });
  });

  it('una corrida fallida trae el error y conserva la última subida buena', async () => {
    await writeFile(
      join(dir, 'status.json'),
      JSON.stringify({
        ok: false,
        error: 'AccessDenied (403)',
        finishedAt: '2026-10-07T05:00:00Z',
        lastSuccessAt: '2026-10-06T05:54:28Z',
        base: null,
        archivos: null,
        borrados: null,
        bucket: null,
      }),
    );
    const status = await new OffsiteStatusService().read();
    expect(status).toEqual(
      expect.objectContaining({ ok: false, error: 'AccessDenied (403)', lastSuccessAt: '2026-10-06T05:54:28Z', dumps: null }),
    );
  });

  it('lee el historial, la más nueva primero, salteando líneas cortadas', async () => {
    await writeFile(join(dir, 'status.json'), STATUS_OK);
    await writeFile(
      join(dir, 'history.jsonl'),
      [
        '{"at":"2026-10-05T03:30:00Z","ok":true,"error":"","durationSec":3,"dump":"a.dump","uploadedDumps":1,"uploadedFiles":2,"movedFiles":0}',
        '{"at":"2026-10-06T03:30:00Z","ok":false,"error":"x","durationSec":1,"dump":"a.dump","uploaded',
        '{"at":"2026-10-07T03:30:00Z","ok":true,"error":"","durationSec":4,"dump":"b.dump","uploadedDumps":1,"uploadedFiles":0,"movedFiles":1}',
      ].join('\n'),
    );
    const { runs } = await new OffsiteStatusService().read();
    expect(runs.map((r) => r.at)).toEqual(['2026-10-07T03:30:00Z', '2026-10-05T03:30:00Z']);
    expect(runs[0]).toEqual(expect.objectContaining({ ok: true, uploadedDumps: 1, movedFiles: 1 }));
  });
});
