import { resolve4 } from 'node:dns/promises';
import { readFile, statfs } from 'node:fs/promises';
import os from 'node:os';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@plexo/database';

const SAMPLE_RETENTION_MS = 7 * 24 * 3_600_000;

export interface DiskUsage {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
}

export interface MemoryUsage {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
  swapTotalBytes: number;
  swapUsedBytes: number;
}

export interface ServerSnapshot {
  takenAt: string;
  cpu: { percent: number; cores: number; load1: number; load5: number; load15: number };
  memory: MemoryUsage;
  disk: DiskUsage;
  uptime: { serverSince: string; appSince: string };
  facts: {
    publicIp: string | null;
    location: string | null;
    os: string | null;
    kernel: string;
    hostname: string | null;
    version: string | null;
    databaseBytes: number | null;
    timeZone: string;
  };
}

export interface MetricPoint {
  takenAt: string;
  cpuPercent: number;
  memPercent: number;
}

type CpuTimes = { idle: number; total: number };

function readCpuTimes(): CpuTimes {
  return os.cpus().reduce(
    (acc, cpu) => {
      const t = cpu.times;
      acc.idle += t.idle;
      acc.total += t.user + t.nice + t.sys + t.idle + t.irq;
      return acc;
    },
    { idle: 0, total: 0 },
  );
}

function cpuPercentBetween(a: CpuTimes, b: CpuTimes): number {
  const total = b.total - a.total;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (1 - (b.idle - a.idle) / total) * 100));
}

/**
 * Estado del servidor para /admin/server, leído desde adentro del contenedor
 * de la API sin instalar nada: el contenedor comparte el kernel con el host,
 * así que /proc/meminfo, os.cpus(), os.loadavg() y os.uptime() son los del
 * servidor (el compose no le pone límites de memoria/CPU). El disco se mide
 * con statfs sobre el volumen de backups, que vive en el disco del host - el
 * total sale de ahí, nunca de un número fijo (si se agranda el plan de Vultr,
 * el panel lo ve solo). Deliberadamente sin montar el socket de Docker.
 *
 * Lo que el contenedor no ve del host (nombre y sistema) sale de
 * /host/hostname y /host/os-release, montados de sólo lectura en
 * docker-compose.prod.yml; la IP pública, de resolver DOMAIN.
 */
@Injectable()
export class ServerMetricsService {
  private readonly logger = new Logger(ServerMetricsService.name);
  private lastSampleCpu: CpuTimes = readCpuTimes();
  private readonly appSince = new Date();

  constructor(private readonly prisma: PrismaService) {}

  async snapshot(): Promise<ServerSnapshot> {
    // Uso "ahora": medio segundo de muestra.
    const before = readCpuTimes();
    await new Promise((r) => setTimeout(r, 500));
    const percent = cpuPercentBetween(before, readCpuTimes());
    const [load1, load5, load15] = os.loadavg();

    const [memory, disk, facts] = await Promise.all([this.memory(), this.disk(), this.facts()]);
    return {
      takenAt: new Date().toISOString(),
      cpu: { percent: Math.round(percent), cores: os.cpus().length, load1, load5, load15 },
      memory,
      disk,
      uptime: {
        serverSince: new Date(Date.now() - os.uptime() * 1000).toISOString(),
        appSince: this.appSince.toISOString(),
      },
      facts,
    };
  }

  async memory(): Promise<MemoryUsage> {
    try {
      const text = await readFile('/proc/meminfo', 'utf8');
      const kb = (key: string) => Number(new RegExp(`^${key}:\\s+(\\d+)`, 'm').exec(text)?.[1] ?? 0) * 1024;
      const totalBytes = kb('MemTotal');
      const availableBytes = kb('MemAvailable');
      const usedBytes = totalBytes - availableBytes;
      return {
        totalBytes,
        usedBytes,
        availableBytes,
        usedPercent: totalBytes ? Math.round((usedBytes / totalBytes) * 100) : 0,
        swapTotalBytes: kb('SwapTotal'),
        swapUsedBytes: kb('SwapTotal') - kb('SwapFree'),
      };
    } catch {
      // Sin /proc (desarrollo en Windows): lo que da Node.
      const totalBytes = os.totalmem();
      const availableBytes = os.freemem();
      return {
        totalBytes,
        usedBytes: totalBytes - availableBytes,
        availableBytes,
        usedPercent: Math.round(((totalBytes - availableBytes) / totalBytes) * 100),
        swapTotalBytes: 0,
        swapUsedBytes: 0,
      };
    }
  }

  async disk(): Promise<DiskUsage> {
    const stats = await statfs(process.env['BACKUP_STORAGE_DIR'] || process.cwd());
    const totalBytes = stats.blocks * stats.bsize;
    const usedBytes = (stats.blocks - stats.bfree) * stats.bsize;
    // bavail: lo que de verdad puede usar un proceso que no es root.
    const freeBytes = stats.bavail * stats.bsize;
    return {
      totalBytes,
      usedBytes,
      freeBytes,
      usedPercent: totalBytes ? Math.round((usedBytes / (usedBytes + freeBytes)) * 100) : 0,
    };
  }

  /** Últimas 24 h (una medición cada 5 min) o 7 días (una cada 30 min). */
  async history(range: '24h' | '7d'): Promise<MetricPoint[]> {
    const hours = range === '7d' ? 168 : 24;
    const rows = await this.prisma.serverMetricSample.findMany({
      where: { takenAt: { gte: new Date(Date.now() - hours * 3_600_000) } },
      orderBy: { takenAt: 'asc' },
    });
    const step = range === '7d' ? 6 : 1;
    return rows
      .filter((_, i) => i % step === 0)
      .map((row) => ({
        takenAt: row.takenAt.toISOString(),
        cpuPercent: Math.round(row.cpuPercent),
        memPercent: Number(row.memTotalBytes) ? Math.round((Number(row.memUsedBytes) / Number(row.memTotalBytes)) * 100) : 0,
      }));
  }

  /** Las últimas n mediciones, de la más nueva a la más vieja (avisos). */
  async latestSamples(n: number): Promise<MetricPoint[]> {
    const rows = await this.prisma.serverMetricSample.findMany({ orderBy: { takenAt: 'desc' }, take: n });
    return rows.map((row) => ({
      takenAt: row.takenAt.toISOString(),
      cpuPercent: row.cpuPercent,
      memPercent: Number(row.memTotalBytes) ? (Number(row.memUsedBytes) / Number(row.memTotalBytes)) * 100 : 0,
    }));
  }

  /** CPU promedio de los últimos 5 minutos (desde la medición anterior). */
  @Cron('*/5 * * * *')
  async recordSample(): Promise<void> {
    try {
      const now = readCpuTimes();
      const cpuPercent = cpuPercentBetween(this.lastSampleCpu, now);
      this.lastSampleCpu = now;
      const [memory, disk] = await Promise.all([this.memory(), this.disk()]);
      await this.prisma.serverMetricSample.create({
        data: {
          cpuPercent,
          memUsedBytes: BigInt(memory.usedBytes),
          memTotalBytes: BigInt(memory.totalBytes),
          swapUsedBytes: BigInt(memory.swapUsedBytes),
          diskUsedBytes: BigInt(disk.usedBytes),
          diskTotalBytes: BigInt(disk.totalBytes),
        },
      });
      await this.prisma.serverMetricSample.deleteMany({
        where: { takenAt: { lt: new Date(Date.now() - SAMPLE_RETENTION_MS) } },
      });
    } catch (err) {
      this.logger.error(`No se pudo guardar la medición del servidor: ${(err as Error).message}`);
    }
  }

  async databaseBytes(): Promise<number | null> {
    try {
      const [row] = await this.prisma.$queryRaw<
        { size: bigint }[]
      >`SELECT pg_database_size(current_database())::bigint AS size`;
      return row ? Number(row.size) : null;
    } catch {
      return null;
    }
  }

  private async facts(): Promise<ServerSnapshot['facts']> {
    const readHost = async (path: string) => {
      try {
        return (await readFile(path, 'utf8')).trim();
      } catch {
        return null;
      }
    };
    const osRelease = await readHost('/host/os-release');
    const prettyName = osRelease ? /^PRETTY_NAME="?([^"\n]+)"?/m.exec(osRelease)?.[1] ?? null : null;

    let publicIp: string | null = null;
    const domain = process.env['DOMAIN'];
    if (domain) {
      try {
        publicIp = (await resolve4(domain))[0] ?? null;
      } catch {
        publicIp = null;
      }
    }

    const databaseBytes = await this.databaseBytes();

    return {
      publicIp,
      location: process.env['SERVER_LOCATION'] || null,
      os: prettyName,
      kernel: os.release(),
      hostname: await readHost('/host/hostname'),
      version: process.env['IMAGE_TAG'] || null,
      databaseBytes,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }
}
