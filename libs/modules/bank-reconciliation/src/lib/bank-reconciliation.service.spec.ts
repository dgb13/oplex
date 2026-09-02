import { BadRequestException, ConflictException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { tenantContextStorage } from '@plexo/database';
import { BankReconciliationService } from './bank-reconciliation.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

async function buildWorkbookBuffer(
  rows: Array<[string, string, unknown]>,
  headers: string[] = ['Fecha', 'Descripción', 'Importe'],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Extracto Bancario');
  sheet.mergeCells(1, 1, 1, headers.length);
  sheet.getRow(1).values = ['instrucciones'];
  sheet.getRow(2).values = headers;
  rows.forEach((row, i) => {
    sheet.getRow(3 + i).values = row;
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

describe('BankReconciliationService.parseAndValidate', () => {
  it('parses valid rows and computes a stable fileHash for the same bytes', async () => {
    const service = new BankReconciliationService();
    const buffer = await buildWorkbookBuffer([
      ['01/09/2026', 'Transferencia recibida', 15000],
      ['02/09/2026', 'Comisión mantenimiento', -850],
    ]);

    const result = await service.parseAndValidate(buffer);

    expect(result.errors).toEqual([]);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toEqual({
      lineDate: new Date(Date.UTC(2026, 8, 1)),
      description: 'Transferencia recibida',
      amount: 15000,
    });
    expect(result.fileHash).toHaveLength(64);

    const second = await service.parseAndValidate(Buffer.from(buffer));
    expect(second.fileHash).toBe(result.fileHash);
  });

  it('reports a missing required column instead of parsing rows', async () => {
    const service = new BankReconciliationService();
    const buffer = await buildWorkbookBuffer([['01/09/2026', 'x', 100]], ['Fecha', 'Importe']);

    const result = await service.parseAndValidate(buffer);

    expect(result.lines).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Descripción');
  });

  it('rejects an invalid date', async () => {
    const service = new BankReconciliationService();
    const buffer = await buildWorkbookBuffer([['no-es-fecha', 'x', 100]]);

    const result = await service.parseAndValidate(buffer);

    expect(result.lines).toEqual([]);
    expect(result.errors).toEqual([{ row: 3, message: expect.stringContaining('Fecha inválida') }]);
  });

  it('rejects a zero amount', async () => {
    const service = new BankReconciliationService();
    const buffer = await buildWorkbookBuffer([['01/09/2026', 'x', 0]]);

    const result = await service.parseAndValidate(buffer);

    expect(result.lines).toEqual([]);
    expect(result.errors).toEqual([{ row: 3, message: expect.stringContaining('Importe inválido') }]);
  });

  it('skips fully blank rows without treating them as errors', async () => {
    const service = new BankReconciliationService();
    const buffer = await buildWorkbookBuffer([
      ['01/09/2026', 'Transferencia recibida', 15000],
      ['', '', ''],
      ['02/09/2026', 'Comisión', -850],
    ]);

    const result = await service.parseAndValidate(buffer);

    expect(result.errors).toEqual([]);
    expect(result.lines).toHaveLength(2);
  });

  it('rejects a file with more than 500 data rows', async () => {
    const service = new BankReconciliationService();
    const rows: Array<[string, string, unknown]> = Array.from({ length: 501 }, (_, i) => [
      '01/09/2026',
      `Movimiento ${i}`,
      100,
    ]);
    const buffer = await buildWorkbookBuffer(rows);

    const result = await service.parseAndValidate(buffer);

    expect(result.lines).toEqual([]);
    expect(result.errors[0].message).toContain('máximo por importación es 500');
  });
});

describe('BankReconciliationService.createImport', () => {
  it('throws ConflictException when the same file was already imported for this account', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'imp-1',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      lineCount: 2,
    });
    const db = { bankStatementImport: { findUnique } };
    const service = new BankReconciliationService();

    await expect(
      runInTenant(db, () =>
        service.createImport({
          financialAccountId: 'acc-1',
          fileName: 'extracto.xlsx',
          fileHash: 'abc123',
          lines: [],
          createdByUserId: 'user-1',
        }),
      ),
    ).rejects.toThrow(ConflictException);

    expect(findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_financialAccountId_fileHash: {
          tenantId: 'tenant-1',
          financialAccountId: 'acc-1',
          fileHash: 'abc123',
        },
      },
    });
  });

  it('creates the import with its lines when the file is new', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({ id: 'imp-2', lines: [] });
    const db = { bankStatementImport: { findUnique, create } };
    const service = new BankReconciliationService();

    const line = { lineDate: new Date('2026-09-01'), description: 'x', amount: 100 };
    await runInTenant(db, () =>
      service.createImport({
        financialAccountId: 'acc-1',
        fileName: 'extracto.xlsx',
        fileHash: 'def456',
        lines: [line],
        createdByUserId: 'user-1',
      }),
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        financialAccountId: 'acc-1',
        fileName: 'extracto.xlsx',
        fileHash: 'def456',
        lineCount: 1,
        createdByUserId: 'user-1',
        lines: {
          createMany: {
            data: [
              {
                tenantId: 'tenant-1',
                financialAccountId: 'acc-1',
                lineDate: line.lineDate,
                description: 'x',
                amount: 100,
                status: 'PENDING',
              },
            ],
          },
        },
      }),
      include: { lines: true },
    });
  });
});

describe('BankReconciliationService line status guards', () => {
  it('markLineMatched rejects a line that is not PENDING', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'line-1', status: 'MATCHED' });
    const db = { bankStatementLine: { findUnique } };
    const service = new BankReconciliationService();

    await expect(
      runInTenant(db, () => service.markLineMatched('line-1', 'tx-1')),
    ).rejects.toThrow(BadRequestException);
  });

  it('markLineIgnored rejects a line that is not PENDING', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'line-1', status: 'IGNORED' });
    const db = { bankStatementLine: { findUnique } };
    const service = new BankReconciliationService();

    await expect(runInTenant(db, () => service.markLineIgnored('line-1'))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('markLineMatched updates status and matchedTransactionId for a PENDING line', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'line-1', status: 'PENDING' });
    const update = jest.fn().mockResolvedValue({ id: 'line-1', status: 'MATCHED' });
    const db = { bankStatementLine: { findUnique, update } };
    const service = new BankReconciliationService();

    await runInTenant(db, () => service.markLineMatched('line-1', 'tx-1'));

    expect(update).toHaveBeenCalledWith({
      where: { id: 'line-1' },
      data: { status: 'MATCHED', matchedTransactionId: 'tx-1' },
    });
  });
});
