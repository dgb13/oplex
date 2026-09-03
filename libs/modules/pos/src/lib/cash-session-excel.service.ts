import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { CashSessionListRow } from './cash-sessions.service.js';

interface ColumnDef {
  header: string;
  width: number;
  value: (s: CashSessionListRow) => string | number;
  isAmount?: boolean;
}

const COLUMNS: ColumnDef[] = [
  { header: 'Caja', width: 24, value: (s) => s.register.name },
  { header: 'Apertura', width: 20, value: (s) => new Date(s.openedAt).toLocaleString('es-AR') },
  { header: 'Cierre', width: 20, value: (s) => (s.closedAt ? new Date(s.closedAt).toLocaleString('es-AR') : '') },
  { header: 'Abrió', width: 24, value: (s) => s.openedBy.name ?? s.openedBy.email },
  { header: 'Cerró', width: 24, value: (s) => (s.closedBy ? (s.closedBy.name ?? s.closedBy.email) : '') },
  { header: 'Esperado', width: 14, value: (s) => Number(s.expectedAmount ?? 0), isAmount: true },
  { header: 'Contado', width: 14, value: (s) => Number(s.countedAmount ?? 0), isAmount: true },
  { header: 'Diferencia', width: 14, value: (s) => Number(s.difference ?? 0), isAmount: true },
];

/** Calcado de VatBookExcelService (libs/modules/taxes) - mismo layout
 * (título fusionado en la fila 1, encabezados en la fila 3 con borde
 * inferior, datos desde la fila 4, columnas de importe con numFmt
 * '#,##0.00'). Mismas columnas que la tabla de /pos/history. */
@Injectable()
export class CashSessionExcelService {
  async generate(sessions: CashSessionListRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Historial de turnos');

    sheet.mergeCells(1, 1, 1, COLUMNS.length);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = 'Historial de turnos de Caja';
    titleCell.font = { bold: true, size: 13 };

    const headerRow = sheet.getRow(3);
    COLUMNS.forEach((col, i) => {
      headerRow.getCell(i + 1).value = col.header;
    });
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.border = { bottom: { style: 'thin' } };
    });
    sheet.columns = COLUMNS.map((col) => ({ width: col.width }));

    sessions.forEach((session, rowIndex) => {
      const row = sheet.getRow(4 + rowIndex);
      COLUMNS.forEach((col, colIndex) => {
        const cell = row.getCell(colIndex + 1);
        cell.value = col.value(session);
        if (col.isAmount) cell.numFmt = '#,##0.00';
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
