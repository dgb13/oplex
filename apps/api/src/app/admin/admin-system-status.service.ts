import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';

const execFileAsync = promisify(execFile);

export interface SystemStatusItem {
  key: string;
  label: string;
  configured: boolean;
  /** Human-readable hint when configured=false (which env vars are
   * missing, or why) - never the value of any var, only its name. */
  detail?: string;
}

export interface LiveTokenCheckResult {
  valid: boolean;
  /** Siempre en español para mostrar en la UI (ver translateMetaError) -
   * el mensaje crudo de Meta (en inglés) nunca llega hasta acá, sólo al
   * log del server. Nunca incluye el valor de ninguna credencial. */
  detail?: string;
}

interface MetaErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

/**
 * Meta devuelve sus mensajes de error siempre en inglés, sin i18n - esta
 * función traduce los casos conocidos (por code/error_subcode, más
 * estables entre versiones de la Graph API que parsear el texto) y cae a
 * un genérico en español para cualquier otro. El texto crudo de Meta se
 * loguea server-side (útil para debug) pero nunca se lo devuelve tal cual
 * al frontend - ver LiveTokenCheckResult.
 */
function translateMetaError(body: MetaErrorBody | null, httpStatus: number): string {
  const error = body?.error;
  if (error?.message) {
    new Logger('AdminSystemStatusService').warn(`Meta rechazó el token de WhatsApp: ${error.message}`);
  }
  // code 190 = OAuthException (token inválido/vencido en cualquiera de
  // sus variantes) - subcode 463 es específicamente "la sesión venció",
  // el caso que en la práctica se da casi siempre con el token temporal
  // de la pantalla "Test API" de Meta.
  if (error?.code === 190 && error.error_subcode === 463) {
    return 'El token venció. Generá uno nuevo desde "Test API"/API Setup en tu app de developers.facebook.com.';
  }
  if (error?.code === 190) {
    return 'Meta rechazó el token de acceso (ya no es válido).';
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return 'Meta rechazó las credenciales (no autorizado).';
  }
  return `Meta respondió con un error (código ${error?.code ?? httpStatus}).`;
}

function isSet(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function missingVars(names: string[]): string[] {
  return names.filter((name) => !isSet(name));
}

/**
 * Structural-only ("¿está la env var puesta?", never "¿el token todavía
 * es válido?") health check for every optional external integration this
 * server reads from process.env - explicitly NOT a live ping against any
 * provider (MP, Resend, Google), on purpose: this must stay cheap and
 * side-effect-free enough to load on every admin page visit, and a wrong
 * green/red from a transient provider outage would be worse than no
 * check at all. If a real "is this token still valid" check is wanted
 * later, that is a deliberately separate, heavier feature per provider,
 * not an extension of this one.
 *
 * ENCRYPTION_MASTER_KEY/JWT_SECRET/DATABASE_URL are deliberately NOT
 * listed here - the app fails to boot without them (EncryptionService's
 * own constructor throws, same for JwtModule.registerAsync), so if this
 * endpoint is reachable at all, they're already known-present - showing
 * them would always read green and add no information, while implying
 * they're "optional" like everything else here.
 */
@Injectable()
export class AdminSystemStatusService {
  async getStatus(): Promise<SystemStatusItem[]> {
    return [
      this.checkGroup('mercadopago', 'Mercado Pago', [
        'MP_CLIENT_ID',
        'MP_CLIENT_SECRET',
        'MP_OAUTH_REDIRECT_URI',
        'MP_ACCESS_TOKEN',
        'MP_WEBHOOK_SECRET',
      ]),
      this.checkGroup('google', 'Google (login social)', ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']),
      this.checkGroup('microsoft', 'Microsoft (login social)', ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET']),
      this.checkGroup('apple', 'Apple (login social)', [
        'APPLE_CLIENT_ID',
        'APPLE_TEAM_ID',
        'APPLE_KEY_ID',
        'APPLE_PRIVATE_KEY',
      ]),
      this.checkGroup('email', 'Email transaccional (Resend)', ['RESEND_API_KEY', 'EMAIL_FROM']),
      // API key propia del asistente de IA conversacional, separada de
      // ANTHROPIC_API_KEY (Carga de Comprobantes IA) - ver
      // docs/plan-asistente-ia-conversacional.md, sección 2: son dos
      // consumos de facturación de Anthropic distintos a propósito.
      this.checkGroup('assistant', 'Asistente de IA (Anthropic)', ['ANTHROPIC_ASSISTANT_API_KEY']),
      // Fase 5b del asistente (docs/plan-asistente-ia-conversacional.md,
      // sección 6.3) - "Configurado" acá sólo dice que las 4 credenciales
      // de la app de Meta están cargadas, NO que el token siga siendo
      // válido (el de la pantalla "Test API" vence a las 24hs y a veces
      // antes) - esa distinción es la misma que ya documenta la clase
      // arriba, vale la pena repetirla acá porque es la integración con
      // el token más volátil de todas las de esta lista.
      this.checkGroup('whatsapp', 'WhatsApp (Meta Cloud API)', [
        'WHATSAPP_CLOUD_API_TOKEN',
        'WHATSAPP_PHONE_NUMBER_ID',
        'WHATSAPP_VERIFY_TOKEN',
        'WHATSAPP_APP_SECRET',
      ]),
      await this.checkBackups(),
    ];
  }

  /**
   * A real ping against Meta's Graph API - the deliberate exception to
   * this class's "structural-only" rule above, opt-in only (the frontend
   * calls this from a "Verificar ahora" button, never automatically on
   * page load) precisely so it doesn't inherit the latency/false-negative
   * problems that rule exists to avoid. WhatsApp gets this and not the
   * other integrations because its token is uniquely short-lived (the
   * Meta "Test API" screen's temp token, ~24h or less before it silently
   * invalidates - see PROGRESS.md) - reading `verified_name` on the
   * configured phone number is the cheapest authenticated GET that
   * actually exercises the token, mirrors WhatsAppCloudApiClient.sendText
   * (apps/api/src/app/whatsapp/) in going straight at the real API with
   * `fetch`, no SDK.
   */
  async verifyWhatsAppToken(): Promise<LiveTokenCheckResult> {
    const token = process.env['WHATSAPP_CLOUD_API_TOKEN'];
    const phoneNumberId = process.env['WHATSAPP_PHONE_NUMBER_ID'];
    if (!token || !phoneNumberId) {
      return { valid: false, detail: 'Faltan WHATSAPP_CLOUD_API_TOKEN/WHATSAPP_PHONE_NUMBER_ID' };
    }
    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=verified_name`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.ok) {
        return { valid: true };
      }
      const body = (await response.json().catch(() => null)) as MetaErrorBody | null;
      return { valid: false, detail: translateMetaError(body, response.status) };
    } catch (err) {
      new Logger('AdminSystemStatusService').warn(
        `No se pudo contactar a Meta para verificar el token: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { valid: false, detail: 'No se pudo contactar a Meta - revisá la conexión del servidor.' };
    }
  }

  private checkGroup(key: string, label: string, vars: string[]): SystemStatusItem {
    const missing = missingVars(vars);
    return {
      key,
      label,
      configured: missing.length === 0,
      detail: missing.length > 0 ? `Falta: ${missing.join(', ')}` : undefined,
    };
  }

  /**
   * Two independent conditions, both required: BACKUP_STORAGE_DIR set AND
   * the pg_dump binary actually reachable on PATH - the exact two-part
   * gap BackupSchedulerService's own doc comment already documents as
   * "not provisioned on any machine yet". `pg_dump --version` is a cheap,
   * read-only, no-network local process spawn - not a live check against
   * any external service, still within this method's "structural only"
   * scope.
   */
  private async checkBackups(): Promise<SystemStatusItem> {
    const missing = missingVars(['BACKUP_STORAGE_DIR']);
    if (missing.length > 0) {
      return { key: 'backups', label: 'Backups automáticos', configured: false, detail: 'Falta: BACKUP_STORAGE_DIR' };
    }
    try {
      await execFileAsync('pg_dump', ['--version'], { timeout: 3000 });
      return { key: 'backups', label: 'Backups automáticos', configured: true };
    } catch {
      return {
        key: 'backups',
        label: 'Backups automáticos',
        configured: false,
        detail: 'BACKUP_STORAGE_DIR está seteado, pero el binario pg_dump no está instalado / no está en el PATH',
      };
    }
  }
}
