import { tenantContextStorage, type PrismaService } from '@plexo/database';
import type { CustomerAssetsService } from '../customer-assets/customer-assets.service.js';
import { pluralizeDocName, WorkOrdersService } from './work-orders.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

const STATUSES = [
  { id: 's1', name: 'Recibido', sortOrder: 0, isFinal: false, notifiesCustomer: false, active: true },
  { id: 's2', name: 'Listo para retirar', sortOrder: 1, isFinal: false, notifiesCustomer: true, active: true },
  { id: 's3', name: 'Entregado', sortOrder: 2, isFinal: true, notifiesCustomer: false, active: true },
];

function makeService() {
  return new WorkOrdersService({} as PrismaService, {} as CustomerAssetsService);
}

describe('pluralizeDocName', () => {
  it('pluralizes the first word of the document name', () => {
    expect(pluralizeDocName('Orden de trabajo')).toBe('Órdenes de trabajo');
    expect(pluralizeDocName('Orden de servicio')).toBe('Órdenes de servicio');
    expect(pluralizeDocName('Pedido')).toBe('Pedidos');
    expect(pluralizeDocName('Comprobante de retiro')).toBe('Comprobantes de retiro');
  });
});

describe('WorkOrdersService.changeStatus', () => {
  function makeDb(order: Record<string, unknown>) {
    return {
      workOrder: {
        findUnique: jest.fn().mockResolvedValue(order),
        update: jest.fn().mockResolvedValue({}),
      },
      workOrderStatus: {
        findUnique: jest.fn(({ where }: { where: { tenantId_id: { id: string } } }) =>
          Promise.resolve(STATUSES.find((s) => s.id === where.tenantId_id.id) ?? null),
        ),
      },
    };
  }

  it('closes the order on a final status and logs who moved it', async () => {
    const db = makeDb({ id: 'wo-1', statusId: 's2', closedAt: null });
    const service = makeService();
    jest.spyOn(service, 'get').mockResolvedValue({} as never);

    await runInTenant(db, () => service.changeStatus('wo-1', 's3'));

    const data = db.workOrder.update.mock.calls[0][0].data;
    expect(data.statusId).toBe('s3');
    expect(data.closedAt).toBeInstanceOf(Date);
    expect(data.statusChanges.create).toEqual({ fromStatusId: 's2', toStatusId: 's3', userId: 'user-1' });
  });

  it('reopens the order when it goes back to a non-final status', async () => {
    const db = makeDb({ id: 'wo-1', statusId: 's3', closedAt: new Date() });
    const service = makeService();
    jest.spyOn(service, 'get').mockResolvedValue({} as never);

    await runInTenant(db, () => service.changeStatus('wo-1', 's2'));

    expect(db.workOrder.update.mock.calls[0][0].data.closedAt).toBeNull();
  });
});

describe('WorkOrdersService.updateConfig', () => {
  const db = { workOrderStatus: { findMany: jest.fn().mockResolvedValue(STATUSES) } };

  it('needs a status that closes the order, and the first one cannot close it', async () => {
    const service = makeService();
    await expect(
      runInTenant(db, () => service.updateConfig({ statuses: [{ name: 'Recibido' }, { name: 'En proceso' }] })),
    ).rejects.toThrow('Marcá al menos un estado que cierre la orden');
    await expect(
      runInTenant(db, () => service.updateConfig({ statuses: [{ name: 'Entregado', isFinal: true }, { name: 'Recibido' }] })),
    ).rejects.toThrow('El primer estado no puede cerrar la orden');
  });

  it('allows a single status per quote outcome', async () => {
    const service = makeService();
    await expect(
      runInTenant(db, () =>
        service.updateConfig({
          statuses: [
            { name: 'Recibido' },
            { name: 'En proceso', quoteOutcome: 'ACCEPTED' },
            { name: 'En reparación', quoteOutcome: 'ACCEPTED' },
            { name: 'Entregado', isFinal: true },
          ],
        }),
      ),
    ).rejects.toThrow('Marcá un solo estado para cuando el cliente acepta el presupuesto');
  });
});
