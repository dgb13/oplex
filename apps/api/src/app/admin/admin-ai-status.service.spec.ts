import type { PrismaService } from '@plexo/database';
import { AdminAiStatusService } from './admin-ai-status.service.js';

const retrieve = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {}
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class NotFoundError extends APIError {}
  class APIConnectionError extends APIError {}
  class Anthropic {
    static AuthenticationError = AuthenticationError;
    static PermissionDeniedError = PermissionDeniedError;
    static NotFoundError = NotFoundError;
    static APIConnectionError = APIConnectionError;
    models = { retrieve };
  }
  return { __esModule: true, default: Anthropic };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Anthropic = jest.requireMock('@anthropic-ai/sdk').default;

function makePrisma() {
  let saved: unknown = null;
  return {
    platformSettings: {
      upsert: jest.fn(async (args: { update: { aiLastTestResults: unknown } }) => {
        saved = args.update.aiLastTestResults;
      }),
      findUnique: jest.fn(async () => ({ aiLastTestAt: new Date('2026-10-14T14:42:00Z'), aiLastTestResults: saved })),
    },
    aiFeatureEvent: { count: jest.fn().mockResolvedValue(0), findFirst: jest.fn().mockResolvedValue(null) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  } as unknown as PrismaService;
}

describe('AdminAiStatusService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    retrieve.mockReset();
    for (const v of ['ANTHROPIC_API_KEY', 'ANTHROPIC_ASSISTANT_API_KEY', 'ANTHROPIC_MODEL', 'ANTHROPIC_ASSISTANT_MODEL', 'ANTHROPIC_ASSISTANT_HELP_MODEL', 'ANTHROPIC_IMPORT_MODEL']) {
      delete process.env[v];
    }
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('summary names the documents key when only the chat key is loaded', () => {
    process.env['ANTHROPIC_ASSISTANT_API_KEY'] = 'sk-ant-chat';
    expect(new AdminAiStatusService(makePrisma()).summary()).toEqual({
      configured: false,
      detail: 'Falta ANTHROPIC_API_KEY (lectura de documentos)',
    });
  });

  it('tests each key + model once (models.retrieve, no cost) and maps the errors per function', async () => {
    process.env['ANTHROPIC_ASSISTANT_API_KEY'] = 'sk-ant-chat';
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-docs';
    process.env['ANTHROPIC_IMPORT_MODEL'] = 'claude-viejo';
    retrieve.mockImplementation(async (model: string) => {
      if (model === 'claude-viejo') throw new Anthropic.NotFoundError('not found');
      return { id: model };
    });

    const status = await new AdminAiStatusService(makePrisma()).test();
    const byKey = Object.fromEntries(status.features.map((f) => [f.key, f.lastTest?.code]));

    expect(byKey).toEqual({
      ASSISTANT_CHAT: 'OK',
      ASSISTANT_HELP: 'OK',
      CONSTANCIA: 'OK',
      INVOICE_SCAN: 'OK',
      ARTICLE_IMPORT: 'MODEL_NOT_FOUND',
    });
    // Constancia y Carga con IA comparten clave y modelo: una sola consulta.
    expect(retrieve).toHaveBeenCalledTimes(4);
  });

  it('reports "Sin clave" without calling Anthropic, and an invalid key as such', async () => {
    process.env['ANTHROPIC_ASSISTANT_API_KEY'] = 'sk-ant-chat';
    retrieve.mockRejectedValue(new Anthropic.AuthenticationError('invalid x-api-key'));

    const status = await new AdminAiStatusService(makePrisma()).test();
    const byKey = Object.fromEntries(status.features.map((f) => [f.key, f.lastTest?.code]));

    expect(byKey['ASSISTANT_CHAT']).toBe('INVALID_KEY');
    expect(byKey['CONSTANCIA']).toBe('NO_KEY');
    expect(byKey['ARTICLE_IMPORT']).toBe('NO_KEY');
  });

  it('treats an empty model variable as unset (ANTHROPIC_MODEL="" in the production .env)', async () => {
    process.env['ANTHROPIC_MODEL'] = '';
    const status = await new AdminAiStatusService(makePrisma()).getStatus();
    expect(status.features.find((f) => f.key === 'CONSTANCIA')?.model).toBe('claude-sonnet-5');
  });
});
