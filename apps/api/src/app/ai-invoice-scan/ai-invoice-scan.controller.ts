import { BadRequestException, Controller, Get, Post, Req } from '@nestjs/common';
import { LongRunningTransaction } from '@plexo/database';
import type { FastifyRequest } from 'fastify';
import '@fastify/multipart';
import { AiInvoiceScanService } from './ai-invoice-scan.service.js';

// Una llamada de vision a Claude puede tardar bastante más que el default
// de transacción de Prisma (5s) - sin esto, TenantContextInterceptor corta
// la transacción del request a los 5s aunque Claude siga respondiendo
// (encontrado en vivo, ver PROGRESS.md). 30s da margen real sin dejar la
// conexión del pool abierta indefinidamente si algo se cuelga.
const AI_EXTRACT_TIMEOUT_MS = 30_000;

// Semáforo + extracción, consumidos por la pantalla "Carga con IA" de
// Compras (ver docs/plan-carga-comprobantes-ia.md). Requiere sesión (no
// @Public()) - la disponibilidad y el resultado dependen del tenant que
// llama. La creación real del comprobante (POST /purchases/purchase-invoices,
// ya soporta el modo sin OC desde 1a) y el adjuntado del archivo original
// (POST /purchases/purchase-invoices/:id/attachment, ya existente) NO se
// reimplementan acá - el frontend los llama directo después de que el
// usuario confirma la pantalla de revisión.
@Controller('purchase-invoices/ai-scan')
export class AiInvoiceScanController {
  constructor(private readonly aiInvoiceScanService: AiInvoiceScanService) {}

  @Get('status')
  getStatus() {
    return this.aiInvoiceScanService.getAvailability();
  }

  @LongRunningTransaction(AI_EXTRACT_TIMEOUT_MS)
  @Post('extract')
  async extract(@Req() req: FastifyRequest) {
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    const buffer = await data.toBuffer();
    return this.aiInvoiceScanService.extractFromUpload(buffer, data.mimetype);
  }
}
