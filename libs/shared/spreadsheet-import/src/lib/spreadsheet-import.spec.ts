import { parseCsv, describeFile, detectHeaderRow } from './parse.js';
import { parseNumber, suggestFields, valueKey } from './cells.js';

const FIELDS = ['code', 'name'] as const;
const SYNONYMS = { code: ['codigo', 'cod'], name: ['nombre', 'razon social'] };
const suggest = (headers: string[]) => suggestFields(headers, FIELDS, SYNONYMS);

describe('spreadsheet-import', () => {
  it('reconoce encabezados sin repetir campos', () => {
    expect(suggest(['Cód.', 'Razón Social', 'Nombre'])).toEqual(['code', 'skip', 'name']);
  });

  it('encuentra la fila de encabezados debajo de un título', () => {
    const grid = parseCsv('Listado al 01/10;;\n\nCódigo;Nombre\n1;Bulonera\n');
    expect(detectHeaderRow(grid, suggest)).toBe(2);
    const analysis = describeFile('id', 'x.csv', grid, suggest);
    expect(analysis).toMatchObject({ headerRow: 3, rowCount: 1 });
    expect(analysis.columns[1]).toMatchObject({ header: 'Nombre', suggested: 'name', samples: ['Bulonera'] });
  });

  it('lee números en formato argentino y arma claves de valores', () => {
    expect(parseNumber('$ 1.234,50')).toBe(1234.5);
    expect(parseNumber('1.500')).toBe(1500);
    expect(valueKey('  Resp. Inscripto ')).toBe('resp. inscripto');
  });
});
