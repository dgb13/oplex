import { execFile } from 'node:child_process';
import { AdminSystemStatusService } from './admin-system-status.service.js';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
const mockedExecFile = execFile as unknown as jest.Mock;

const MP_VARS = ['MP_CLIENT_ID', 'MP_CLIENT_SECRET', 'MP_OAUTH_REDIRECT_URI', 'MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET'];
const WHATSAPP_VARS = [
  'WHATSAPP_CLOUD_API_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
];
const ALL_MANAGED_VARS = [
  ...MP_VARS,
  ...WHATSAPP_VARS,
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'APPLE_CLIENT_ID',
  'APPLE_TEAM_ID',
  'APPLE_KEY_ID',
  'APPLE_PRIVATE_KEY',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'BACKUP_STORAGE_DIR',
  'ANTHROPIC_ASSISTANT_API_KEY',
];

describe('AdminSystemStatusService.getStatus', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const key of ALL_MANAGED_VARS) delete process.env[key];
    mockedExecFile.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('reports Mercado Pago as configured only when all 5 vars are set', async () => {
    for (const key of MP_VARS) process.env[key] = 'x';
    const service = new AdminSystemStatusService();

    const status = await service.getStatus();

    const mp = status.find((s) => s.key === 'mercadopago');
    expect(mp).toEqual({ key: 'mercadopago', label: 'Mercado Pago', configured: true, detail: undefined });
  });

  it('reports Mercado Pago as not configured and names exactly the missing vars', async () => {
    process.env['MP_CLIENT_ID'] = 'x';
    process.env['MP_CLIENT_SECRET'] = 'x';
    // MP_OAUTH_REDIRECT_URI, MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET left unset
    const service = new AdminSystemStatusService();

    const status = await service.getStatus();

    const mp = status.find((s) => s.key === 'mercadopago');
    expect(mp?.configured).toBe(false);
    expect(mp?.detail).toBe('Falta: MP_OAUTH_REDIRECT_URI, MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET');
  });

  it('treats a blank/whitespace-only value the same as unset', async () => {
    for (const key of MP_VARS) process.env[key] = 'x';
    process.env['MP_WEBHOOK_SECRET'] = '   ';
    const service = new AdminSystemStatusService();

    const status = await service.getStatus();

    expect(status.find((s) => s.key === 'mercadopago')?.configured).toBe(false);
  });

  it('reports the assistant as configured only when ANTHROPIC_ASSISTANT_API_KEY is set', async () => {
    const service = new AdminSystemStatusService();

    const unconfigured = await service.getStatus();
    expect(unconfigured.find((s) => s.key === 'assistant')).toEqual({
      key: 'assistant',
      label: 'Asistente de IA (Anthropic)',
      configured: false,
      detail: 'Falta: ANTHROPIC_ASSISTANT_API_KEY',
    });

    process.env['ANTHROPIC_ASSISTANT_API_KEY'] = 'sk-ant-x';
    const configured = await service.getStatus();
    expect(configured.find((s) => s.key === 'assistant')).toEqual({
      key: 'assistant',
      label: 'Asistente de IA (Anthropic)',
      configured: true,
      detail: undefined,
    });
  });

  it('reports WhatsApp as configured only when all 4 Meta Cloud API vars are set', async () => {
    const service = new AdminSystemStatusService();

    const unconfigured = await service.getStatus();
    expect(unconfigured.find((s) => s.key === 'whatsapp')).toEqual({
      key: 'whatsapp',
      label: 'WhatsApp (Meta Cloud API)',
      configured: false,
      detail: `Falta: ${WHATSAPP_VARS.join(', ')}`,
    });

    for (const key of WHATSAPP_VARS) process.env[key] = 'x';
    const configured = await service.getStatus();
    expect(configured.find((s) => s.key === 'whatsapp')).toEqual({
      key: 'whatsapp',
      label: 'WhatsApp (Meta Cloud API)',
      configured: true,
      detail: undefined,
    });
  });

  it('never lists ENCRYPTION_MASTER_KEY/JWT_SECRET/DATABASE_URL - they are boot-required, not optional', async () => {
    const service = new AdminSystemStatusService();

    const status = await service.getStatus();

    const allDetails = status.map((s) => s.detail).join(' ');
    expect(allDetails).not.toContain('ENCRYPTION_MASTER_KEY');
    expect(allDetails).not.toContain('JWT_SECRET');
    expect(allDetails).not.toContain('DATABASE_URL');
  });

  it('backups: reports not configured when BACKUP_STORAGE_DIR is missing, without even checking pg_dump', async () => {
    const service = new AdminSystemStatusService();

    const status = await service.getStatus();

    expect(status.find((s) => s.key === 'backups')).toEqual({
      key: 'backups',
      label: 'Backups automáticos',
      configured: false,
      detail: 'Falta: BACKUP_STORAGE_DIR',
    });
    expect(mockedExecFile).not.toHaveBeenCalled();
  });
});

describe('AdminSystemStatusService.verifyWhatsAppToken', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    for (const key of WHATSAPP_VARS) delete process.env[key];
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('reports invalid without calling Meta when the required vars are missing', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new AdminSystemStatusService();

    const result = await service.verifyWhatsAppToken();

    expect(result).toEqual({
      valid: false,
      detail: 'Faltan WHATSAPP_CLOUD_API_TOKEN/WHATSAPP_PHONE_NUMBER_ID',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports valid when Meta accepts the token', async () => {
    process.env['WHATSAPP_CLOUD_API_TOKEN'] = 'token-x';
    process.env['WHATSAPP_PHONE_NUMBER_ID'] = 'phone-x';
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new AdminSystemStatusService();

    const result = await service.verifyWhatsAppToken();

    expect(result).toEqual({ valid: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/phone-x?fields=verified_name',
      { headers: { Authorization: 'Bearer token-x' } },
    );
  });

  it('translates the expired-session case (code 190/subcode 463) to a specific Spanish message, never the raw English one', async () => {
    process.env['WHATSAPP_CLOUD_API_TOKEN'] = 'token-x';
    process.env['WHATSAPP_PHONE_NUMBER_ID'] = 'phone-x';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          error: {
            message: 'Error validating access token: Session has expired on Thursday, 10-Sep-26 21:00:00 PDT.',
            type: 'OAuthException',
            code: 190,
            error_subcode: 463,
          },
        }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new AdminSystemStatusService();

    const result = await service.verifyWhatsAppToken();

    expect(result.valid).toBe(false);
    expect(result.detail).toBe(
      'El token venció. Generá uno nuevo desde "Test API"/API Setup en tu app de developers.facebook.com.',
    );
    expect(result.detail).not.toMatch(/Session has expired/);
  });

  it('translates any other OAuthException (code 190) to a generic Spanish "rechazado" message', async () => {
    process.env['WHATSAPP_CLOUD_API_TOKEN'] = 'token-x';
    process.env['WHATSAPP_PHONE_NUMBER_ID'] = 'phone-x';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: 'Some other OAuth failure', code: 190, error_subcode: 999 } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new AdminSystemStatusService();

    const result = await service.verifyWhatsAppToken();

    expect(result).toEqual({ valid: false, detail: 'Meta rechazó el token de acceso (ya no es válido).' });
  });

  it('reports a generic Spanish detail when Meta returns no parseable error body', async () => {
    process.env['WHATSAPP_CLOUD_API_TOKEN'] = 'token-x';
    process.env['WHATSAPP_PHONE_NUMBER_ID'] = 'phone-x';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new AdminSystemStatusService();

    const result = await service.verifyWhatsAppToken();

    expect(result).toEqual({ valid: false, detail: 'Meta respondió con un error (código 500).' });
  });

  it('reports a generic Spanish detail when the request itself throws (network failure), never the raw error message', async () => {
    process.env['WHATSAPP_CLOUD_API_TOKEN'] = 'token-x';
    process.env['WHATSAPP_PHONE_NUMBER_ID'] = 'phone-x';
    const fetchMock = jest.fn().mockRejectedValue(new Error('fetch failed'));
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new AdminSystemStatusService();

    const result = await service.verifyWhatsAppToken();

    expect(result).toEqual({
      valid: false,
      detail: 'No se pudo contactar a Meta - revisá la conexión del servidor.',
    });
  });

  it('backups: reports not configured when BACKUP_STORAGE_DIR is set but pg_dump is not on PATH', async () => {
    process.env['BACKUP_STORAGE_DIR'] = '/tmp/backups';
    mockedExecFile.mockImplementation((_cmd, _args, _opts, cb) => cb(new Error('ENOENT')));
    const service = new AdminSystemStatusService();

    const status = await service.getStatus();

    const backups = status.find((s) => s.key === 'backups');
    expect(backups?.configured).toBe(false);
    expect(backups?.detail).toContain('pg_dump');
  });

  it('backups: reports configured when BACKUP_STORAGE_DIR is set and pg_dump responds', async () => {
    process.env['BACKUP_STORAGE_DIR'] = '/tmp/backups';
    mockedExecFile.mockImplementation((_cmd, _args, _opts, cb) => cb(null, 'pg_dump (PostgreSQL) 18.0', ''));
    const service = new AdminSystemStatusService();

    const status = await service.getStatus();

    expect(status.find((s) => s.key === 'backups')).toEqual({
      key: 'backups',
      label: 'Backups automáticos',
      configured: true,
      detail: undefined,
    });
  });
});
