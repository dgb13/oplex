import { Injectable, Logger } from '@nestjs/common';

const GRAPH_API_VERSION = 'v21.0';

/**
 * Fase 5b (docs/plan-asistente-ia-conversacional.md, sección 6.3) - envío de
 * la respuesta de vuelta al usuario vía la API de envío de WhatsApp Cloud
 * API. Solo texto (sección 5.3: "WhatsApp: solo texto - sin componentes"),
 * sin dependencia del SDK oficial de Meta (no existe uno first-party en
 * Node) - mismo criterio ya usado para AFIP WSFE/BNA/ARGENTINADATOS: `fetch`
 * directo contra la API real, sin capa intermedia.
 *
 * Nunca lanza: un fallo de envío (token vencido, número fuera del
 * allow-list de prueba, etc.) no debe tirar abajo el procesamiento del
 * webhook - WhatsAppWebhookService ya logueó/persistió lo que pudo antes de
 * llamar acá, esto es best-effort igual que
 * MercadoPagoOAuthClient.fetchAccountNickname.
 */
@Injectable()
export class WhatsAppCloudApiClient {
  private readonly logger = new Logger(WhatsAppCloudApiClient.name);

  async sendText(toE164: string, body: string): Promise<void> {
    const token = process.env['WHATSAPP_CLOUD_API_TOKEN'];
    const phoneNumberId = process.env['WHATSAPP_PHONE_NUMBER_ID'];
    if (!token || !phoneNumberId) {
      this.logger.warn('No se pudo enviar el mensaje de WhatsApp: faltan WHATSAPP_CLOUD_API_TOKEN/WHATSAPP_PHONE_NUMBER_ID');
      return;
    }

    // Meta espera el "to" sin el "+" del E.164 que usamos como identificador
    // interno (WhatsAppLink.phoneE164) - mismo formato en el que ya llega
    // "from" en el webhook entrante.
    const to = toE164.replace(/^\+/, '');

    try {
      const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body },
        }),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Falló el envío de WhatsApp (HTTP ${response.status}): ${errorBody}`);
      }
    } catch (err) {
      this.logger.error(`Falló el envío de WhatsApp: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
