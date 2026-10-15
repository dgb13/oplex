import { BadRequestException, Controller, Get, Logger, Optional, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import { ConstanciaExtractionService } from '@plexo/ai-invoice-scan';
import { Roles } from '@plexo/auth';
import { LongRunningTransaction } from '@plexo/database';
import type { FastifyRequest } from 'fastify';
import '@fastify/multipart';
import { AiEventsService } from '../ai-events/ai-events.service.js';
import { ArcaConstanciaLinkService } from './arca-constancia-link.service.js';

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

// "Verificar con tu Constancia de Inscripción" (Contabilidad → Conexión con ARCA → Datos de la
// empresa). El archivo no se guarda: se lee con IA y se devuelve para que
// la UI lo compare contra el padrón. No consume el cupo de "Carga con IA"
// (es parte del alta del emisor, una vez por tenant).
@Controller('arca/constancia')
export class ArcaConstanciaController {
  private readonly logger = new Logger(ArcaConstanciaController.name);

  constructor(
    private readonly constancia: ConstanciaExtractionService,
    private readonly link: ArcaConstanciaLinkService,
    @Optional() private readonly aiEvents?: AiEventsService,
  ) {}

  // Botón "Abrir la consulta en ARCA" del paso 1 (enlace administrable en /admin).
  @Roles('OWNER', 'ADMIN')
  @Get('link')
  async getLink() {
    return { url: await this.link.getUrl() };
  }

  @Roles('OWNER', 'ADMIN')
  @LongRunningTransaction(45_000)
  @Post('read')
  async read(@Req() req: FastifyRequest) {
    const data = await req.file();
    if (!data) throw new BadRequestException('No se recibió ningún archivo');
    if (!ALLOWED.includes(data.mimetype)) {
      throw new BadRequestException('Subí la constancia en PDF o como foto (JPG/PNG).');
    }
    const buffer = await data.toBuffer();
    try {
      const result = await this.constancia.extract(buffer, data.mimetype);
      await this.aiEvents?.record('CONSTANCIA', true);
      return result;
    } catch (err) {
      this.logger.error(`No se pudo leer la constancia con IA: ${(err as Error).message}`);
      await this.aiEvents?.record('CONSTANCIA', false, (err as Error).message);
      throw new ServiceUnavailableException('No se pudo leer la constancia con IA en este momento.');
    }
  }
}
