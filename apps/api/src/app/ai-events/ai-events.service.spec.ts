import { type PrismaService, tenantContextStorage } from '@plexo/database';
import { AiEventsService } from './ai-events.service.js';

function makePrisma() {
  return {
    aiFeatureEvent: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('AiEventsService.record', () => {
  it('stores the failure with the tenant of the request and keeps only the latest 20 failures', async () => {
    const prisma = makePrisma();
    const service = new AiEventsService(prisma as unknown as PrismaService);

    await tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'u', tx: {} as never }, () =>
      service.record('CONSTANCIA', false, 'invalid x-api-key'),
    );

    expect(prisma.aiFeatureEvent.create).toHaveBeenCalledWith({
      data: { feature: 'CONSTANCIA', ok: false, tenantId: 'tenant-1', reason: 'invalid x-api-key' },
    });
    expect(prisma.aiFeatureEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ok: false }, take: 20 }));
    expect(prisma.aiFeatureEvent.deleteMany).toHaveBeenCalledWith({ where: { ok: false, id: { notIn: ['e1', 'e2'] } } });
  });

  it('never throws: a database error only goes to the log', async () => {
    const prisma = makePrisma();
    prisma.aiFeatureEvent.create.mockRejectedValue(new Error('db down'));
    const service = new AiEventsService(prisma as unknown as PrismaService);

    await expect(service.record('INVOICE_SCAN', false, 'x')).resolves.toBeUndefined();
  });
});
