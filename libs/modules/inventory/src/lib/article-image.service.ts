import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId } from '@plexo/database';
import type { Article, ArticleImage } from '@plexo/database';

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_SIZE_BYTES = 3 * 1024 * 1024; // 3MB - well under fastify's global 5MB multipart cap
export const MAX_ARTICLE_IMAGES = 8;

/** Fotos de un artículo. Files live on local disk under
 * `uploads/articles/`, named with a random uuid (not the tenantId - see
 * main.ts's @fastify/static registration for why serving them
 * unauthenticated is an acceptable, narrow exception here). Sin
 * procesamiento en el servidor (evita una dependencia nativa como sharp):
 * la web achica cada foto en el navegador antes de subirla.
 *
 * Hasta MAX_ARTICLE_IMAGES por artículo (ArticleImage). La primera es la
 * principal y se copia siempre en Article.imageUrl - el catálogo, el POS,
 * la importación y los PDF siguen leyendo sólo ese campo. Un artículo con
 * imageUrl pero sin filas (cargado antes de que existieran las fotos
 * múltiples por algún camino que no pasó por acá) se adopta como su única
 * foto la primera vez que se lo toca (ver ensureRows). */
@Injectable()
export class ArticleImageService {
  private readonly logger = new Logger(ArticleImageService.name);
  private readonly uploadsDir = join(process.cwd(), 'uploads', 'articles');

  constructor() {
    mkdirSync(this.uploadsDir, { recursive: true });
  }

  async listImages(articleId: string): Promise<ArticleImage[]> {
    await this.findArticle(articleId);
    return this.ensureRows(articleId);
  }

  /** Suma una foto al final (o como principal si es la primera). */
  async addImage(articleId: string, mimeType: string, buffer: Buffer): Promise<ArticleImage[]> {
    await this.findArticle(articleId);
    const images = await this.ensureRows(articleId);
    if (images.length >= MAX_ARTICLE_IMAGES) {
      throw new BadRequestException(`Un artículo puede tener hasta ${MAX_ARTICLE_IMAGES} fotos`);
    }
    const url = await this.saveFile(mimeType, buffer);
    const last = images[images.length - 1];
    await getTenantDb().articleImage.create({
      data: { tenantId: getTenantId(), articleId, url, sortOrder: last ? last.sortOrder + 1 : 0 },
    });
    return this.syncMain(articleId);
  }

  /** Quita una foto (y su archivo). Si era la principal, pasa a serlo la siguiente. */
  async removeImageById(imageId: string): Promise<ArticleImage[]> {
    const db = getTenantDb();
    const image = await db.articleImage.findUnique({ where: { id: imageId } });
    if (!image) {
      throw new NotFoundException('Foto no encontrada');
    }
    await db.articleImage.delete({ where: { id: imageId } });
    const images = await this.syncMain(image.articleId);
    await this.deleteFileForUrl(image.url);
    return images;
  }

  /** Nuevo orden completo (la primera queda como principal). */
  async reorder(articleId: string, imageIds: string[]): Promise<ArticleImage[]> {
    await this.findArticle(articleId);
    const images = await this.ensureRows(articleId);
    const current = new Set(images.map((i) => i.id));
    if (imageIds.length !== current.size || imageIds.some((id) => !current.has(id))) {
      throw new BadRequestException('El orden tiene que incluir todas las fotos del artículo, una vez cada una');
    }
    const db = getTenantDb();
    for (const [index, id] of imageIds.entries()) {
      await db.articleImage.update({ where: { id }, data: { sortOrder: index } });
    }
    return this.syncMain(articleId);
  }

  /** "Cambiar la foto" de antes (ficha, importación): reemplaza la principal
   * y deja las demás como están. Sin fotos, la agrega como principal. */
  async setImage(articleId: string, mimeType: string, buffer: Buffer): Promise<Article> {
    await this.findArticle(articleId);
    const images = await this.ensureRows(articleId);
    const url = await this.saveFile(mimeType, buffer);
    const db = getTenantDb();
    const main = images[0];
    if (main) {
      await db.articleImage.update({ where: { id: main.id }, data: { url } });
    } else {
      await db.articleImage.create({ data: { tenantId: getTenantId(), articleId, url, sortOrder: 0 } });
    }
    await this.syncMain(articleId);
    if (main) {
      await this.deleteFileForUrl(main.url);
    }
    return this.findArticle(articleId);
  }

  /** "Quitar la foto" de antes: quita la principal. */
  async removeImage(articleId: string): Promise<Article> {
    await this.findArticle(articleId);
    const [main] = await this.ensureRows(articleId);
    if (main) {
      await this.removeImageById(main.id);
    }
    return this.findArticle(articleId);
  }

  private async findArticle(articleId: string): Promise<Article> {
    const article = await getTenantDb().article.findUnique({ where: { id: articleId } });
    if (!article) {
      throw new NotFoundException('Article not found');
    }
    return article;
  }

  private async ensureRows(articleId: string): Promise<ArticleImage[]> {
    const db = getTenantDb();
    const images = await db.articleImage.findMany({ where: { articleId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    if (images.length > 0) {
      return images;
    }
    const article = await this.findArticle(articleId);
    if (!article.imageUrl) {
      return [];
    }
    return [await db.articleImage.create({ data: { tenantId: getTenantId(), articleId, url: article.imageUrl, sortOrder: 0 } })];
  }

  /** Copia la principal en Article.imageUrl y devuelve las fotos en orden. */
  private async syncMain(articleId: string): Promise<ArticleImage[]> {
    const db = getTenantDb();
    const images = await db.articleImage.findMany({ where: { articleId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    await db.article.update({ where: { id: articleId }, data: { imageUrl: images[0]?.url ?? null } });
    return images;
  }

  private async saveFile(mimeType: string, buffer: Buffer): Promise<string> {
    const extension = ALLOWED_MIME_TYPES[mimeType];
    if (!extension) {
      throw new BadRequestException('Only JPEG, PNG or WEBP images are allowed');
    }
    if (buffer.length > MAX_SIZE_BYTES) {
      throw new BadRequestException('Image must be smaller than 3MB');
    }
    const filename = `${randomUUID()}.${extension}`;
    await writeFile(join(this.uploadsDir, filename), buffer);
    return `/uploads/articles/${filename}`;
  }

  /** Best-effort: a stale file left on disk after a DB update is a minor
   * cleanup issue, never a reason to fail the request that already
   * succeeded at the thing the user asked for. */
  private async deleteFileForUrl(imageUrl: string): Promise<void> {
    const filename = imageUrl.split('/').pop();
    if (!filename) {
      return;
    }
    try {
      await unlink(join(this.uploadsDir, filename));
    } catch (error) {
      this.logger.warn(`Failed to delete old article image ${filename}: ${error}`);
    }
  }
}
