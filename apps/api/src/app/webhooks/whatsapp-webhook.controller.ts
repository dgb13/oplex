import { Controller, ForbiddenException, Get, Headers, HttpCode, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { Public } from '@plexo/auth';
import type { FastifyRequest } from 'fastify';
import { WhatsAppWebhookService, type WhatsAppWebhookBody } from './whatsapp-webhook.service.js';

/**
 * @Public() en ambas rutas - Meta llama a esto server-to-server, nunca con
 * un token de sesión de Oplex (mismo motivo que MercadoPagoWebhookController).
 *
 * `GET`: handshake de suscripción del webhook (Meta lo llama UNA vez al
 * configurar la URL en el panel de developers, y de nuevo cada vez que se
 * cambia). Los nombres de query param llevan un punto literal ("hub.mode") -
 * mismo tratamiento como clave plana ya usado para `query['data.id']` en
 * MercadoPagoWebhookController, no un objeto anidado.
 */
@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  constructor(private readonly webhookService: WhatsAppWebhookService) {}

  @Public()
  @Get()
  verify(@Query() query: Record<string, string | undefined>): string {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    if (mode === 'subscribe' && token && token === process.env['WHATSAPP_VERIFY_TOKEN'] && challenge) {
      return challenge;
    }
    throw new ForbiddenException('Verificación de webhook de WhatsApp fallida');
  }

  /**
   * Responde 200 apenas la firma es válida, ANTES de terminar de procesar el
   * mensaje - Meta reintenta la entrega si no recibe un 2xx rápido (su
   * ventana documentada es corta), y una vuelta completa por Claude
   * (potencialmente varias llamadas a herramientas, ver
   * AssistantOrchestratorService) puede tardar más que eso. Igual que
   * MercadoPagoWebhookService deja anotado un gap de infra (rate limiting)
   * en vez de resolverlo ahí mismo, acá el gap anotado es "no hay dedup de
   * reintentos de Meta todavía" (a diferencia de MercadoPagoWebhookService,
   * que sí tiene WebhookEvent para eso) - aceptable para el volumen del
   * número de prueba (allow-list de hasta 5 teléfonos), a revisar antes de
   * un número de producción real (Fase 5d).
   */
  @Public()
  @Post()
  @HttpCode(200)
  handle(
    @Headers('x-hub-signature-256') signatureHeader: string | undefined,
    @Req() request: FastifyRequest,
  ): void {
    const rawBody = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
    if (!this.webhookService.verifySignature(rawBody, signatureHeader)) {
      throw new UnauthorizedException('Firma de WhatsApp inválida');
    }
    const body = request.body as WhatsAppWebhookBody;
    this.webhookService.processIncoming(body).catch((err: unknown) => {
      this.webhookService.logProcessingError(err);
    });
  }
}
