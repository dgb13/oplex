import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getTenantDb } from '@plexo/database';
import type { User } from '@plexo/database';

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_SIZE_BYTES = 3 * 1024 * 1024; // 3MB - same cap as PersonAvatarService/ArticleImageService

/** Same pattern as PersonAvatarService - files on local disk under
 * `uploads/users/`, random uuid filename, served unauthenticated via the
 * generic `/uploads/` prefix in main.ts. User.avatarUrl also accepts a
 * plain string directly via UpdateProfileDto (a pasted URL, or one of the
 * `preset:` identifiers the frontend's avatar picker writes) - this service
 * only covers the "upload a real file" path. */
@Injectable()
export class UserAvatarService {
  private readonly logger = new Logger(UserAvatarService.name);
  private readonly uploadsDir = join(process.cwd(), 'uploads', 'users');

  constructor() {
    mkdirSync(this.uploadsDir, { recursive: true });
  }

  async setAvatar(userId: string, mimeType: string, buffer: Buffer): Promise<User> {
    const extension = ALLOWED_MIME_TYPES[mimeType];
    if (!extension) {
      throw new BadRequestException('Solo se permiten imágenes JPEG, PNG o WEBP');
    }
    if (buffer.length > MAX_SIZE_BYTES) {
      throw new BadRequestException('La imagen tiene que pesar menos de 3MB');
    }

    const db = getTenantDb();
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const filename = `${randomUUID()}.${extension}`;
    await writeFile(join(this.uploadsDir, filename), buffer);

    const updated = await db.user.update({
      where: { id: userId },
      data: { avatarUrl: `/uploads/users/${filename}` },
    });

    if (user.avatarUrl?.startsWith('/uploads/users/')) {
      await this.deleteFileForUrl(user.avatarUrl);
    }
    return updated;
  }

  async removeAvatar(userId: string): Promise<User> {
    const db = getTenantDb();
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await db.user.update({ where: { id: userId }, data: { avatarUrl: null } });
    if (user.avatarUrl?.startsWith('/uploads/users/')) {
      await this.deleteFileForUrl(user.avatarUrl);
    }
    return updated;
  }

  /** Best-effort cleanup, same reasoning as PersonAvatarService - a stale
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
      this.logger.warn(`Failed to delete old user avatar ${filename}: ${error}`);
    }
  }
}
