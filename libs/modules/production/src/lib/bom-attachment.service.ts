import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId, getUserId, type BomAttachment } from '@plexo/database';

const PDF_MIME_TYPE = 'application/pdf';
const PDF_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB - mismo límite que Article.brochureUrl

// El navegador/SO no siempre manda el mismo tipo MIME para un .zip - mismo
// motivo/criterio que ArticleAttachmentsService (exige además que el
// nombre termine en .zip, no confía sólo en el MIME).
const ZIP_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
]);
const ZIP_MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB - mismo límite que Article.attachmentZipUrl

/**
 * Documentación (PDF/ZIP) de una versión puntual de receta - ver
 * BomAttachment en el schema. A diferencia de ArticleAttachmentsService
 * (un slot por tipo, subir uno nuevo pisa el anterior), acá puede haber
 * varios archivos por receta - tabla independiente, no un campo suelto.
 * Mismo patrón de disco que el resto de los uploads (uploads/bom/, nombre
 * random-uuid, servido sin autenticación vía @fastify/static).
 */
@Injectable()
export class BomAttachmentService {
  private readonly logger = new Logger(BomAttachmentService.name);
  private readonly uploadsDir = join(process.cwd(), 'uploads', 'bom');

  constructor() {
    mkdirSync(this.uploadsDir, { recursive: true });
  }

  list(bomId: string): Promise<BomAttachment[]> {
    return getTenantDb().bomAttachment.findMany({
      where: { bomId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upload(
    bomId: string,
    mimeType: string,
    originalFilename: string,
    buffer: Buffer,
  ): Promise<BomAttachment> {
    const db = getTenantDb();
    const uploadedByUserId = getUserId();
    if (!uploadedByUserId) {
      throw new BadRequestException('Se requiere un usuario autenticado para subir un adjunto');
    }
    const bom = await db.billOfMaterials.findUnique({ where: { id: bomId } });
    if (!bom) {
      throw new NotFoundException('Receta (BOM) no encontrada');
    }

    const isPdf = mimeType === PDF_MIME_TYPE && originalFilename.toLowerCase().endsWith('.pdf');
    const isZip = ZIP_MIME_TYPES.has(mimeType) && originalFilename.toLowerCase().endsWith('.zip');
    if (!isPdf && !isZip) {
      throw new BadRequestException('Sólo se permiten archivos PDF o ZIP');
    }
    const maxSize = isPdf ? PDF_MAX_SIZE_BYTES : ZIP_MAX_SIZE_BYTES;
    if (buffer.length > maxSize) {
      throw new BadRequestException(`El archivo debe pesar menos de ${maxSize / (1024 * 1024)}MB`);
    }

    const extension = isPdf ? 'pdf' : 'zip';
    const filename = `${randomUUID()}.${extension}`;
    await writeFile(join(this.uploadsDir, filename), buffer);

    return db.bomAttachment.create({
      data: {
        tenantId: getTenantId(),
        bomId,
        fileType: isPdf ? 'PDF' : 'ZIP',
        fileName: originalFilename,
        fileUrl: `/uploads/bom/${filename}`,
        fileSizeBytes: buffer.length,
        uploadedByUserId,
      },
    });
  }

  async remove(attachmentId: string): Promise<void> {
    const db = getTenantDb();
    const attachment = await db.bomAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) {
      throw new NotFoundException('Adjunto no encontrado');
    }
    await db.bomAttachment.delete({ where: { id: attachmentId } });

    const filename = attachment.fileUrl.split('/').pop();
    if (!filename) {
      return;
    }
    try {
      await unlink(join(this.uploadsDir, filename));
    } catch (error) {
      // Best-effort, mismo criterio que ArticleAttachmentsService - un
      // archivo huérfano en disco no amerita fallar un delete que ya
      // logró lo que el usuario pidió.
      this.logger.warn(`Failed to delete BOM attachment file ${filename}: ${error}`);
    }
  }
}
