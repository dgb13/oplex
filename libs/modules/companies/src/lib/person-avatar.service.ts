import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getTenantDb } from '@plexo/database';
import type { Person } from '@plexo/database';
import { assertCanManagePersonCompany } from './company-permissions.js';

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_SIZE_BYTES = 3 * 1024 * 1024; // 3MB - same cap as ArticleImageService

/** Same pattern as ArticleImageService (first file-storage feature) - files
 * on local disk under `uploads/people/`, random uuid filename, served
 * unauthenticated via the generic `/uploads/` prefix in main.ts. Person also
 * accepts a pasted URL directly in `avatarUrl` via UpdatePersonDto - this
 * service only covers the "upload a real file" path. */
@Injectable()
export class PersonAvatarService {
  private readonly logger = new Logger(PersonAvatarService.name);
  private readonly uploadsDir = join(process.cwd(), 'uploads', 'people');

  constructor() {
    mkdirSync(this.uploadsDir, { recursive: true });
  }

  async setAvatar(personId: string, mimeType: string, buffer: Buffer): Promise<Person> {
    const extension = ALLOWED_MIME_TYPES[mimeType];
    if (!extension) {
      throw new BadRequestException('Only JPEG, PNG or WEBP images are allowed');
    }
    if (buffer.length > MAX_SIZE_BYTES) {
      throw new BadRequestException('Image must be smaller than 3MB');
    }

    const db = getTenantDb();
    const person = await db.person.findUnique({ where: { id: personId } });
    if (!person) {
      throw new NotFoundException('Person not found');
    }
    await assertCanManagePersonCompany(personId);

    const filename = `${randomUUID()}.${extension}`;
    await writeFile(join(this.uploadsDir, filename), buffer);

    const updated = await db.person.update({
      where: { id: personId },
      data: { avatarUrl: `/uploads/people/${filename}` },
    });

    if (person.avatarUrl?.startsWith('/uploads/people/')) {
      await this.deleteFileForUrl(person.avatarUrl);
    }
    return updated;
  }

  async removeAvatar(personId: string): Promise<Person> {
    const db = getTenantDb();
    const person = await db.person.findUnique({ where: { id: personId } });
    if (!person) {
      throw new NotFoundException('Person not found');
    }
    await assertCanManagePersonCompany(personId);

    const updated = await db.person.update({ where: { id: personId }, data: { avatarUrl: null } });
    if (person.avatarUrl?.startsWith('/uploads/people/')) {
      await this.deleteFileForUrl(person.avatarUrl);
    }
    return updated;
  }

  /** Best-effort cleanup, same reasoning as ArticleImageService - a stale
   * file left on disk is never a reason to fail a request that already
   * succeeded at updating the DB. */
  private async deleteFileForUrl(imageUrl: string): Promise<void> {
    const filename = imageUrl.split('/').pop();
    if (!filename) {
      return;
    }
    try {
      await unlink(join(this.uploadsDir, filename));
    } catch (error) {
      this.logger.warn(`Failed to delete old person avatar ${filename}: ${error}`);
    }
  }
}
