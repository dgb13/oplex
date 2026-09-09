import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';

const execFileAsync = promisify(execFile);

export interface SystemStatusItem {
  key: string;
  label: string;
  configured: boolean;
  /** Human-readable hint when configured=false (which env vars are
   * missing, or why) - never the value of any var, only its name. */
  detail?: string;
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
      await this.checkBackups(),
    ];
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
