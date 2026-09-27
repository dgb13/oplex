import { BadRequestException, Controller, Logger, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import { ConstanciaExtractionService } from '@plexo/ai-invoice-scan';
import { Roles } from '@plexo/auth';
import { LongRunningTransaction } from '@plexo/database';
import type { FastifyRequest } from 'fastify';
import '@fastify/multipart';

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

// "Verificar con tu Constancia de Inscripción" (Contabilidad → Conexión con ARCA → Datos de la
// empresa). El archivo no se guarda: se lee con IA y se devuelve para que
// la UI lo compare contra el padrón. No consume el cupo de "Carga con IA"
// (es parte del alta del emisor, una vez por tenant).
@Controller('arca/constancia')
export class ArcaConstanciaController {
  private readonly logger = new Logger(ArcaConstanciaController.name);

  constructor(private readonly constancia: ConstanciaExtractionService) {}

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
      return await this.constancia.extract(buffer, data.mimetype);
    } catch (err) {
      this.logger.error(`No se pudo leer la constancia con IA: ${(err as Error).message}`);
      throw new ServiceUnavailableException('No se pudo leer la constancia con IA en este momento.');
    }
  }
}
