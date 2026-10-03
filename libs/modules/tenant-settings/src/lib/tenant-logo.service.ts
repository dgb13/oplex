import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { getTenantDb, getTenantId } from '@plexo/database';

// Sin WEBP ni SVG: el generador de PDF (@react-pdf/renderer) sólo dibuja
// PNG y JPG, y el logo existe sobre todo para los PDF.
const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
const MAX_SIZE_BYTES = 2 * 1024 * 1024;

/** Logo de la empresa (TenantSettings.logoUrl) - mismo patrón que
 * UserAvatarService/PersonAvatarService: archivo en `uploads/tenant-logos/`
 * con nombre uuid, servido sin login por el prefijo `/uploads/` de main.ts.
 * Lo usan los PDF de Cotizaciones (ver @plexo/quotes, build-pdf-data). */
@Injectable()
export class TenantLogoService {
  private readonly logger = new Logger(TenantLogoService.name);
  private readonly uploadsDir = join(process.cwd(), 'uploads', 'tenant-logos');

  constructor() {
    mkdirSync(this.uploadsDir, { recursive: true });
  }

  async setLogo(mimeType: string, buffer: Buffer): Promise<void> {
    const extension = ALLOWED_MIME_TYPES[mimeType];
    if (!extension) {
      throw new BadRequestException('El logo tiene que ser una imagen PNG o JPG');
    }
    if (buffer.length > MAX_SIZE_BYTES) {
      throw new BadRequestException('El logo tiene que pesar menos de 2MB');
    }

    const tenantId = getTenantId();
    const db = getTenantDb();
    const previous = await db.tenantSettings.findUnique({ where: { tenantId }, select: { logoUrl: true } });

    const filename = `${randomUUID()}.${extension}`;
    await writeFile(join(this.uploadsDir, filename), buffer);
    const logoUrl = `/uploads/tenant-logos/${filename}`;
    await db.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, logoUrl },
      update: { logoUrl },
    });

    if (previous?.logoUrl) {
      await this.deleteFileForUrl(previous.logoUrl);
    }
  }

  async removeLogo(): Promise<void> {
    const tenantId = getTenantId();
    const db = getTenantDb();
    const previous = await db.tenantSettings.findUnique({ where: { tenantId }, select: { logoUrl: true } });
    if (!previous?.logoUrl) {
      return;
    }
    await db.tenantSettings.update({ where: { tenantId }, data: { logoUrl: null } });
    await this.deleteFileForUrl(previous.logoUrl);
  }

  /** Un archivo viejo que queda en disco nunca hace fallar un pedido que ya
   * actualizó la base - mismo criterio que UserAvatarService. */
  private async deleteFileForUrl(logoUrl: string): Promise<void> {
    if (!logoUrl.startsWith('/uploads/tenant-logos/')) {
      return;
    }
    const filename = logoUrl.split('/').pop();
    if (!filename) {
      return;
    }
    try {
      await unlink(join(this.uploadsDir, filename));
    } catch (error) {
      this.logger.warn(`No se pudo borrar el logo anterior ${filename}: ${error}`);
    }
  }
}
