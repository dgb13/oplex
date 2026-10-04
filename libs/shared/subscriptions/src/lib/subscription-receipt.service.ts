import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, Injectable } from '@nestjs/common';

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

/** Comprobante de la transferencia que el tenant adjunta al avisar el pago
 * del plan. Mismo patrón de archivo que UserAvatarService: disco local bajo
 * `uploads/subscription-receipts/`, nombre uuid, servido por `/uploads/`. */
@Injectable()
export class SubscriptionReceiptService {
  private readonly uploadsDir = join(process.cwd(), 'uploads', 'subscription-receipts');

  constructor() {
    mkdirSync(this.uploadsDir, { recursive: true });
  }

  async save(mimeType: string, buffer: Buffer): Promise<string> {
    const extension = ALLOWED_MIME_TYPES[mimeType];
    if (!extension) {
      throw new BadRequestException('El comprobante tiene que ser una imagen (JPG o PNG) o un PDF');
    }
    if (buffer.length > MAX_SIZE_BYTES) {
      throw new BadRequestException('El comprobante tiene que pesar menos de 5MB');
    }
    const filename = `${randomUUID()}.${extension}`;
    await writeFile(join(this.uploadsDir, filename), buffer);
    return `/uploads/subscription-receipts/${filename}`;
  }
}
