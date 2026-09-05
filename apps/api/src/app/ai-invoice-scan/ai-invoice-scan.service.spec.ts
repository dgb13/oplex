import type { AiInvoiceExtractionService } from '@plexo/ai-invoice-scan';
import { tenantContextStorage } from '@plexo/database';
import type { PrismaService } from '@plexo/database';
import type { SubscriptionService } from '@plexo/subscriptions';
import { AiInvoiceScanService } from './ai-invoice-scan.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

const DEFAULT_USAGE = { planName: 'Gold', quota: 100, used: 0 };

function makeService(opts: {
  aiInvoiceScanEnabled?: boolean;
  assertCanUseAiInvoiceScan?: () => Promise<void>;
  getAiInvoiceScanUsage?: () => Promise<unknown>;
  extract?: () => Promise<unknown>;
  // recordAttempt() abre su PROPIA $transaction (ver el comentario en el
  // service - a propósito, para que sobreviva un rollback de la request
  // externa) - este mock es lo que ve esa transacción propia, nunca el
  // `db` que runInTenant() pasa para la tx externa de getAvailability().
  recordAttemptCreate?: jest.Mock;
}) {
  const recordAttemptCreate = opts.recordAttemptCreate ?? jest.fn();
  const prisma = {
    platformSettings: {
      findUnique: jest.fn().mockResolvedValue({ aiInvoiceScanEnabled: opts.aiInvoiceScanEnabled ?? true }),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $executeRaw: jest.fn(), aiInvoiceScanAttempt: { create: recordAttemptCreate } }),
    ),
  } as unknown as PrismaService;
  const subscriptionService = {
    assertCanUseAiInvoiceScan: opts.assertCanUseAiInvoiceScan ?? jest.fn().mockResolvedValue(undefined),
    getAiInvoiceScanUsage: opts.getAiInvoiceScanUsage ?? jest.fn().mockResolvedValue(DEFAULT_USAGE),
  } as unknown as SubscriptionService;
  const aiInvoiceExtractionService = {
    extract: opts.extract ?? jest.fn().mockResolvedValue({}),
  } as unknown as AiInvoiceExtractionService;
  return new AiInvoiceScanService(prisma, subscriptionService, aiInvoiceExtractionService);
}

describe('AiInvoiceScanService.getAvailability', () => {
  it('is red when the platform kill-switch is off, without even checking the plan/quota, and does not recommend upgrading (not a plan issue)', async () => {
    const assertCanUseAiInvoiceScan = jest.fn();
    const getAiInvoiceScanUsage = jest.fn();
    const service = makeService({ aiInvoiceScanEnabled: false, assertCanUseAiInvoiceScan, getAiInvoiceScanUsage });

    const result = await runInTenant({}, () => service.getAvailability());

    expect(result).toEqual({
      available: 'red',
      reason: 'El escaneo automático no está disponible en este momento.',
      upgradeRecommended: false,
    });
    expect(assertCanUseAiInvoiceScan).not.toHaveBeenCalled();
    expect(getAiInvoiceScanUsage).not.toHaveBeenCalled();
  });

  it('is red without recommending upgrade when the circuit breaker trips (Claude flaky, not a plan issue) - still carries usage', async () => {
    const service = makeService({});
    const db = {
      aiInvoiceScanAttempt: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ status: 'FAILURE' }, { status: 'FAILURE' }, { status: 'FAILURE' }]),
      },
    };

    const result = await runInTenant(db, () => service.getAvailability());

    expect(result).toEqual({
      available: 'red',
      reason: expect.any(String),
      upgradeRecommended: false,
      usage: DEFAULT_USAGE,
    });
  });

  it('is red with the exact message from SubscriptionService when the plan/quota check fails, and recommends upgrading', async () => {
    const service = makeService({
      assertCanUseAiInvoiceScan: jest.fn().mockRejectedValue(new Error('Alcanzaste el límite mensual')),
    });
    const db = { aiInvoiceScanAttempt: { findMany: jest.fn() } };

    const result = await runInTenant(db, () => service.getAvailability());

    expect(result).toEqual({
      available: 'red',
      reason: 'Alcanzaste el límite mensual',
      upgradeRecommended: true,
      usage: DEFAULT_USAGE,
    });
  });

  it('is green when there are no recent failures, and carries the usage from SubscriptionService', async () => {
    const service = makeService({});
    const db = { aiInvoiceScanAttempt: { findMany: jest.fn().mockResolvedValue([]) } };

    const result = await runInTenant(db, () => service.getAvailability());

    expect(result).toEqual({ available: 'green', usage: DEFAULT_USAGE });
  });

  it('is yellow when some but not all recent attempts failed', async () => {
    const service = makeService({});
    const db = {
      aiInvoiceScanAttempt: {
        findMany: jest.fn().mockResolvedValue([{ status: 'SUCCESS' }, { status: 'FAILURE' }]),
      },
    };

    const result = await runInTenant(db, () => service.getAvailability());

    expect(result.available).toBe('yellow');
  });

  it('is red when at least 3 recent attempts all failed', async () => {
    const service = makeService({});
    const db = {
      aiInvoiceScanAttempt: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ status: 'FAILURE' }, { status: 'FAILURE' }, { status: 'FAILURE' }]),
      },
    };

    const result = await runInTenant(db, () => service.getAvailability());

    expect(result.available).toBe('red');
  });

  it('does not go red off a single old failure mixed with fewer than 3 samples', async () => {
    const service = makeService({});
    const db = {
      aiInvoiceScanAttempt: { findMany: jest.fn().mockResolvedValue([{ status: 'FAILURE' }]) },
    };

    const result = await runInTenant(db, () => service.getAvailability());

    expect(result.available).toBe('yellow');
  });
});

describe('AiInvoiceScanService.extractFromUpload', () => {
  it('rejects without calling extract() when the availability check is red (kill-switch, quota, or circuit breaker)', async () => {
    const extract = jest.fn();
    const recordAttemptCreate = jest.fn();
    const service = makeService({ aiInvoiceScanEnabled: false, extract, recordAttemptCreate });

    await expect(runInTenant({}, () => service.extractFromUpload(Buffer.from('x'), 'image/jpeg'))).rejects.toThrow();
    expect(extract).not.toHaveBeenCalled();
    expect(recordAttemptCreate).not.toHaveBeenCalled();
  });

  it('records a SUCCESS attempt (in its own transaction) and returns the extraction result when available', async () => {
    const extractionResult = { supplierCuit: { value: '30111222339', source: 'ai', confidence: 0.9 } };
    const extract = jest.fn().mockResolvedValue(extractionResult);
    const recordAttemptCreate = jest.fn();
    const service = makeService({ extract, recordAttemptCreate });
    const db = { aiInvoiceScanAttempt: { findMany: jest.fn().mockResolvedValue([]) } };

    const result = await runInTenant(db, () => service.extractFromUpload(Buffer.from('x'), 'image/jpeg'));

    expect(result).toBe(extractionResult);
    expect(recordAttemptCreate).toHaveBeenCalledWith({
      data: { tenantId: 'tenant-1', status: 'SUCCESS', errorReason: undefined },
    });
  });

  it('records the real error as errorReason (for diagnosis) but throws a friendly, generic message to the caller', async () => {
    const extract = jest.fn().mockRejectedValue(new Error('Claude no devolvió una extracción estructurada'));
    const recordAttemptCreate = jest.fn();
    const service = makeService({ extract, recordAttemptCreate });
    const db = { aiInvoiceScanAttempt: { findMany: jest.fn().mockResolvedValue([]) } };

    await expect(runInTenant(db, () => service.extractFromUpload(Buffer.from('x'), 'image/jpeg'))).rejects.toThrow(
      'No se pudo leer el comprobante con IA en este momento',
    );
    expect(recordAttemptCreate).toHaveBeenCalledWith({
      data: { tenantId: 'tenant-1', status: 'FAILURE', errorReason: 'Claude no devolvió una extracción estructurada' },
    });
  });
});

describe('AiInvoiceScanService settings', () => {
  it('get-or-creates the singleton PlatformSettings row', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({ aiInvoiceScanEnabled: true });
    const prisma = { platformSettings: { findUnique, create } } as unknown as PrismaService;
    const service = new AiInvoiceScanService(prisma, {} as SubscriptionService, {} as AiInvoiceExtractionService);

    const result = await service.getSettings();

    expect(create).toHaveBeenCalledWith({ data: { id: 'global' } });
    expect(result).toEqual({ aiInvoiceScanEnabled: true });
  });

  it('updateSettings upserts the toggle', async () => {
    const upsert = jest.fn().mockResolvedValue({ aiInvoiceScanEnabled: false });
    const prisma = { platformSettings: { upsert } } as unknown as PrismaService;
    const service = new AiInvoiceScanService(prisma, {} as SubscriptionService, {} as AiInvoiceExtractionService);

    await service.updateSettings(false);

    expect(upsert).toHaveBeenCalledWith({
      where: { id: 'global' },
      create: { id: 'global', aiInvoiceScanEnabled: false },
      update: { aiInvoiceScanEnabled: false },
    });
  });
});
