import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import {
  getTenantDb,
  getTenantId,
  type BankStatementImport,
  type BankStatementLine,
  type BankStatementLineStatus,
} from '@plexo/database';

const MAX_ROWS = 500;

const COLUMNS = [
  { key: 'lineDate', header: 'Fecha' },
  { key: 'description', header: 'Descripción' },
  { key: 'amount', header: 'Importe' },
] as const;

type ColumnKey = (typeof COLUMNS)[number]['key'];

const INSTRUCTIONS =
  'INSTRUCCIONES: Fecha, Descripción e Importe son obligatorios en todas las filas. ' +
  'Fecha en formato DD/MM/AAAA. Importe: positivo si es un ingreso (te acreditaron plata), ' +
  'negativo si es un egreso (te debitaron plata) - nunca puede ser 0. El importador ignora ' +
  'filas completamente vacías. Máximo 500 filas de datos por archivo.';

export interface BankStatementImportRowError {
  row: number;
  message: string;
}

export interface ParsedStatementLine {
  lineDate: Date;
  description: string;
  amount: number;
}

export interface ParseResult {
  fileHash: string;
  lines: ParsedStatementLine[];
  errors: BankStatementImportRowError[];
}

export interface CreateImportInput {
  financialAccountId: string;
  fileName: string;
  fileHash: string;
  lines: ParsedStatementLine[];
  createdByUserId: string;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'text' in (value as Record<string, unknown>)) {
    return String((value as { text: unknown }).text ?? '').trim();
  }
  return String(value).trim();
}

function cellNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function cellDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const text = cellText(value);
  if (!text) return null;

  const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (isoDate) {
    const [, y, m, d] = isoDate;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/**
 * Nunca importa @plexo/reports-financial/@plexo/accounting (regla del
 * repo: un lib module nunca importa el Service de otro) - sólo
 * getTenantDb(). El algoritmo de matching automático y la generación de
 * asientos contables son responsabilidad de la composición-root en
 * apps/api (ver apps/api/src/app/bank-reconciliation/), igual que
 * CheckService/TreasuryService.
 */
@Injectable()
export class BankReconciliationService {
  async generateTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Extracto Bancario');
    const headers = COLUMNS.map((c) => c.header);

    sheet.columns = COLUMNS.map(() => ({ width: 26 }));

    sheet.mergeCells(1, 1, 1, headers.length);
    const instructionsCell = sheet.getCell(1, 1);
    instructionsCell.value = INSTRUCTIONS;
    instructionsCell.alignment = { wrapText: true, vertical: 'top' };
    instructionsCell.font = { bold: true };
    sheet.getRow(1).height = 75;

    const headerRow = sheet.getRow(2);
    headerRow.values = headers;
    headerRow.font = { bold: true };

    sheet.getRow(3).values = ['01/09/2026', 'Transferencia recibida', 15000];
    sheet.getRow(4).values = ['02/09/2026', 'Comisión mantenimiento de cuenta', -850];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async parseAndValidate(buffer: Buffer): Promise<ParseResult> {
    const fileHash = createHash('sha256').update(buffer).digest('hex');

    const workbook = new ExcelJS.Workbook();
    // exceljs's bundled .d.ts predates the generic Buffer<TArrayBuffer> type
    // introduced in newer @types/node - same runtime value, cast needed to
    // satisfy the structurally-stricter declared parameter type.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return { fileHash, lines: [], errors: [{ row: 0, message: 'El archivo no tiene ninguna hoja' }] };
    }

    const headerRow = sheet.getRow(2);
    const columnIndexByKey = new Map<ColumnKey, number>();
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const normalized = cellText(cell.value).toLowerCase();
      const match = COLUMNS.find((c) => c.header.toLowerCase() === normalized);
      if (match) columnIndexByKey.set(match.key, colNumber);
    });

    const missingColumns = COLUMNS.filter((c) => !columnIndexByKey.has(c.key));
    if (missingColumns.length > 0) {
      return {
        fileHash,
        lines: [],
        errors: [
          {
            row: 2,
            message: `Faltan columnas obligatorias en el archivo: ${missingColumns.map((c) => c.header).join(', ')}`,
          },
        ],
      };
    }

    const get = (row: ExcelJS.Row, key: ColumnKey): unknown => {
      const col = columnIndexByKey.get(key);
      return col ? row.getCell(col).value : undefined;
    };

    const dataRows: ExcelJS.Row[] = [];
    for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const isBlank = COLUMNS.every((c) => cellText(get(row, c.key)) === '');
      if (!isBlank) dataRows.push(row);
    }

    if (dataRows.length === 0) {
      return { fileHash, lines: [], errors: [{ row: 3, message: 'El archivo no tiene filas de datos' }] };
    }
    if (dataRows.length > MAX_ROWS) {
      return {
        fileHash,
        lines: [],
        errors: [
          {
            row: 0,
            message: `El archivo tiene ${dataRows.length} filas, el máximo por importación es ${MAX_ROWS}. Dividilo en partes más chicas.`,
          },
        ],
      };
    }

    const errors: BankStatementImportRowError[] = [];
    const lines: ParsedStatementLine[] = [];

    for (const row of dataRows) {
      const rowNumber = row.number;
      const lineDate = cellDate(get(row, 'lineDate'));
      const description = cellText(get(row, 'description'));
      const amount = cellNumber(get(row, 'amount'));

      if (!lineDate) {
        errors.push({ row: rowNumber, message: 'Fecha inválida o faltante (formato esperado DD/MM/AAAA)' });
        continue;
      }
      if (!description) {
        errors.push({ row: rowNumber, message: 'Falta la Descripción' });
        continue;
      }
      if (amount === null || amount === 0) {
        errors.push({ row: rowNumber, message: 'Importe inválido: debe ser un número distinto de 0' });
        continue;
      }

      lines.push({ lineDate, description, amount });
    }

    if (errors.length > 0) {
      return { fileHash, lines: [], errors: errors.sort((a, b) => a.row - b.row) };
    }

    return { fileHash, lines, errors: [] };
  }

  async createImport(
    input: CreateImportInput,
  ): Promise<BankStatementImport & { lines: BankStatementLine[] }> {
    const db = getTenantDb();
    const tenantId = getTenantId();

    const existing = await db.bankStatementImport.findUnique({
      where: {
        tenantId_financialAccountId_fileHash: {
          tenantId,
          financialAccountId: input.financialAccountId,
          fileHash: input.fileHash,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Este archivo ya se importó el ${existing.createdAt.toLocaleDateString('es-AR')} (${existing.lineCount} líneas) - no se importa dos veces.`,
      );
    }

    return db.bankStatementImport.create({
      data: {
        tenantId,
        financialAccountId: input.financialAccountId,
        fileName: input.fileName,
        fileHash: input.fileHash,
        lineCount: input.lines.length,
        createdByUserId: input.createdByUserId,
        lines: {
          createMany: {
            data: input.lines.map((line) => ({
              tenantId,
              financialAccountId: input.financialAccountId,
              lineDate: line.lineDate,
              description: line.description,
              amount: line.amount,
              status: 'PENDING',
            })),
          },
        },
      },
      include: { lines: true },
    });
  }

  listImports(financialAccountId: string): Promise<BankStatementImport[]> {
    return getTenantDb().bankStatementImport.findMany({
      where: { financialAccountId },
      orderBy: { createdAt: 'desc' },
    });
  }

  listLines(financialAccountId: string, status?: BankStatementLineStatus): Promise<BankStatementLine[]> {
    return getTenantDb().bankStatementLine.findMany({
      where: { financialAccountId, ...(status ? { status } : {}) },
      orderBy: { lineDate: 'asc' },
    });
  }

  async getLine(id: string): Promise<BankStatementLine> {
    const line = await getTenantDb().bankStatementLine.findUnique({ where: { id } });
    if (!line) {
      throw new NotFoundException('Bank statement line not found');
    }
    return line;
  }

  async markLineMatched(id: string, transactionId: string): Promise<BankStatementLine> {
    const line = await this.getLine(id);
    if (line.status !== 'PENDING') {
      throw new BadRequestException(`No se puede vincular una línea en estado ${line.status}`);
    }
    return getTenantDb().bankStatementLine.update({
      where: { id },
      data: { status: 'MATCHED', matchedTransactionId: transactionId },
    });
  }

  async markLineIgnored(id: string): Promise<BankStatementLine> {
    const line = await this.getLine(id);
    if (line.status !== 'PENDING') {
      throw new BadRequestException(`No se puede ignorar una línea en estado ${line.status}`);
    }
    return getTenantDb().bankStatementLine.update({
      where: { id },
      data: { status: 'IGNORED' },
    });
  }
}
