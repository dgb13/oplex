import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { cellText, isBlank, type Cell } from './cells.js';

export const MAX_IMPORT_ROWS = 20_000;
const HEADER_SCAN_ROWS = 15;
const SAMPLE_VALUES = 3;

export interface ImportColumn<F extends string> {
  index: number;
  header: string;
  samples: string[];
  suggested: F | 'skip';
}

export interface ImportAnalysis<F extends string> {
  importId: string;
  fileName: string;
  sheetName: string;
  headerRow: number;
  rowCount: number;
  columns: ImportColumn<F>[];
}

function extensionOf(fileName: string): string {
  const match = /\.[a-z0-9]+$/i.exec(fileName);
  return match ? match[0].toLowerCase() : '';
}

/** Lee un Excel (.xlsx) o CSV. `itemsLabel` va en los mensajes ("artículos",
 * "empresas"). Las filas vacías quedan en su lugar: así los números de
 * fila que ve el usuario son los mismos que en su Excel. */
export async function parseFile(fileName: string, buffer: Buffer, itemsLabel: string): Promise<Cell[][]> {
  const ext = extensionOf(fileName);
  if (ext === '.xls') {
    throw new BadRequestException('Ese archivo es de Excel viejo (.xls). Abrilo en Excel y guardalo como .xlsx, o como CSV.');
  }
  let grid: Cell[][];
  if (ext === '.csv' || ext === '.txt') {
    grid = parseCsv(decodeText(buffer));
  } else if (ext === '.xlsx') {
    grid = await parseXlsx(buffer);
  } else {
    throw new BadRequestException('Subí un archivo de Excel (.xlsx) o CSV');
  }
  const filled = grid.filter((row) => !isBlank(row)).length;
  if (filled < 2) throw new BadRequestException(`El archivo no tiene ${itemsLabel}`);
  if (filled - 1 > MAX_IMPORT_ROWS) {
    throw new BadRequestException(`El archivo tiene más de ${MAX_IMPORT_ROWS.toLocaleString('es-AR')} filas: dividilo en partes`);
  }
  return grid;
}

async function parseXlsx(buffer: Buffer): Promise<Cell[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new BadRequestException('No se pudo leer el archivo de Excel. ¿Está dañado o protegido con contraseña?');
  }
  // La hoja con más filas: muchas exportaciones traen una carátula primero.
  const sheet = [...workbook.worksheets].sort((a, b) => b.actualRowCount - a.actualRowCount)[0];
  if (!sheet) throw new BadRequestException('El archivo no tiene hojas');
  const grid: Cell[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    while (grid.length < row.number - 1) grid.push([]);
    const values: Cell[] = [];
    for (let c = 1; c <= sheet.columnCount; c++) {
      const v = row.getCell(c).value;
      if (v === null || v === undefined) values.push(null);
      else if (typeof v === 'number' || typeof v === 'string' || v instanceof Date) values.push(v);
      else {
        const result = (v as { result?: unknown }).result;
        values.push(typeof result === 'number' ? result : cellText(v));
      }
    }
    grid.push(values);
  });
  return grid;
}

/** Excel en castellano guarda los CSV en Windows-1252, no en UTF-8. */
// Caracter de reemplazo (aparece al leer como UTF-8 algo que no lo es) y BOM.
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);
const BOM = String.fromCharCode(0xfeff);

function decodeText(buffer: Buffer): string {
  const utf8 = buffer.toString('utf8');
  if (utf8.includes(REPLACEMENT_CHAR)) return new TextDecoder('windows-1252').decode(buffer);
  return utf8.startsWith(BOM) ? utf8.slice(1) : utf8;
}

export function parseCsv(text: string): Cell[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', ',', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field.trim() || null);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim() || null);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field.trim() || null);
    rows.push(row);
  }
  return rows;
}

/** La fila de encabezados es, entre las primeras, la que más columnas
 * reconoce (según `suggest`); si ninguna reconoce nada, la primera. */
export function detectHeaderRow(grid: Cell[][], suggest: (headers: string[]) => string[]): number {
  let best = 0;
  let bestScore = 0;
  for (let i = 0; i < Math.min(HEADER_SCAN_ROWS, grid.length - 1); i++) {
    const score = suggest(grid[i].map((c) => cellText(c))).filter((f) => f !== 'skip').length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

/** Columnas del archivo con sus primeros valores y el campo sugerido. */
export function describeFile<F extends string>(
  importId: string,
  fileName: string,
  grid: Cell[][],
  suggest: (headers: string[]) => (F | 'skip')[],
): ImportAnalysis<F> {
  const headerRow = detectHeaderRow(grid, suggest);
  const headers = grid[headerRow].map((c, i) => cellText(c) || `Columna ${i + 1}`);
  const suggested = suggest(headers);
  const body = grid.slice(headerRow + 1).filter((row) => !isBlank(row));
  return {
    importId,
    fileName,
    sheetName: '',
    headerRow: headerRow + 1,
    rowCount: body.length,
    columns: headers.map((header, index) => ({
      index,
      header,
      suggested: suggested[index],
      samples: body
        .map((row) => cellText(row[index]))
        .filter(Boolean)
        .slice(0, SAMPLE_VALUES),
    })),
  };
}

/**
 * Archivos subidos para importar, en `storage/imports/<tenant>/` (NO en
 * `uploads/`, que se sirve sin login), para no tener que volver a subirlos
 * en cada paso del asistente.
 */
const STORAGE_DIR = join(process.cwd(), 'storage', 'imports');

export async function saveUpload(tenantId: string, fileName: string, buffer: Buffer): Promise<string> {
  const importId = randomUUID();
  const dir = join(STORAGE_DIR, tenantId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${importId}${extensionOf(fileName)}`), buffer);
  await writeFile(join(dir, `${importId}.name`), fileName);
  return importId;
}

export async function loadUpload(tenantId: string, importId: string): Promise<{ fileName: string; buffer: Buffer }> {
  if (!/^[0-9a-f-]{36}$/.test(importId)) throw new NotFoundException('No hay una importación con ese número');
  const dir = join(STORAGE_DIR, tenantId);
  let fileName: string;
  try {
    fileName = await readFile(join(dir, `${importId}.name`), 'utf8');
  } catch {
    throw new NotFoundException('El archivo ya no está disponible: volvé a subirlo');
  }
  const buffer = await readFile(join(dir, `${importId}${extensionOf(fileName)}`));
  return { fileName, buffer };
}
