import { buildPlan, detectHeaderRow, NO_TAX, parseCsv, type ImportOptions, type Refs } from '../article-import.service.js';
import { guessTax, guessUnit, parseNumber, suggestMapping } from './import-fields.js';

const TAXES = [
  { id: 'iva21', name: 'IVA 21%', calculationType: 'PERCENTAGE', rate: 21 },
  { id: 'iva105', name: 'IVA 10,5%', calculationType: 'PERCENTAGE', rate: 10.5 },
  { id: 'exento', name: 'Exento', calculationType: 'EXENTO', rate: null },
];

function refs(): Refs {
  return {
    variantsBySku: new Map([['tor-0616', { id: 'v1', articleId: 'a1', unitPrice: 3150 }]]),
    categoryIdByName: new Map([['bulonería', 'cat1']]),
    supplierIdByName: new Map([['bulonera del sur', 'sup1']]),
    taxes: TAXES,
  };
}

describe('suggestMapping', () => {
  it('reconoce los encabezados de una lista exportada de otro sistema', () => {
    expect(
      suggestMapping(['Cód.', 'Descripción', 'Rubro', 'Marca', 'P. Costo', 'P. Venta', 'IVA', 'Existencia', 'Proveedor', 'Unid.', 'Ubicación']),
    ).toEqual(['sku', 'name', 'category', 'brand', 'cost', 'price', 'tax', 'stock', 'supplier', 'unit', 'skip']);
  });

  it('no asigna el mismo campo a dos columnas', () => {
    expect(suggestMapping(['Código', 'Código interno', 'Precio'])).toEqual(['sku', 'skip', 'price']);
  });
});

describe('parseNumber', () => {
  it.each([
    ['3.237,50', 3237.5],
    ['$ 1.234.567,89', 1234567.89],
    ['1234.5', 1234.5],
    ['1.500', 1500],
    ['10,5', 10.5],
    ['21%', 21],
    [42, 42],
    ['', null],
    ['abc', null],
  ])('%s -> %s', (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });
});

describe('guessTax / guessUnit', () => {
  it('interpreta las formas habituales de escribir el IVA', () => {
    expect(guessTax('21', TAXES)).toBe('iva21');
    expect(guessTax('10.5', TAXES)).toBe('iva105');
    expect(guessTax('10,5%', TAXES)).toBe('iva105');
    expect(guessTax('0.21', TAXES)).toBe('iva21');
    expect(guessTax('EX', TAXES)).toBe('exento');
    expect(guessTax('27', TAXES)).toBeNull();
  });

  it('interpreta las unidades y deja sin resolver las raras', () => {
    expect(guessUnit('UN')).toBe('UNIT');
    expect(guessUnit('Kgs')).toBe('KG');
    expect(guessUnit('LT')).toBe('LTR');
    expect(guessUnit('')).toBe('UNIT');
    expect(guessUnit('ROLLO')).toBeNull();
  });
});

describe('detectHeaderRow / parseCsv', () => {
  it('encuentra los encabezados aunque haya un título arriba', () => {
    const grid = parseCsv('Lista de precios Ferretería;;\n\nCód.;Descripción;P. Venta\nTOR-1;Tornillo;"1.234,50"\n');
    expect(detectHeaderRow(grid.filter((r) => r.some(Boolean)))).toBe(1);
  });

  it('lee el separador y las comillas de un CSV de Excel en castellano', () => {
    expect(parseCsv('a;b;c\r\n"x;y";2;"dice ""hola"""\r\n')).toEqual([
      ['a', 'b', 'c'],
      ['x;y', '2', 'dice "hola"'],
    ]);
  });
});

describe('buildPlan', () => {
  const header = ['Cód.', 'Descripción', 'Rubro', 'P. Costo', 'P. Venta', 'IVA', 'Existencia', 'Proveedor', 'Unid.'];
  const mapping = suggestMapping(header);
  const base: ImportOptions = { mapping, onExisting: 'update', pricesIncludeVat: false };
  const grid = [
    header,
    ['TOR-0612', 'Tornillo 6x1/2', 'Bulonería', 1850, 3237.5, '21', 48, 'Bulonera del Sur', 'UN'],
    ['TOR-0616', 'Tornillo 6x5/8', 'Bulonería', 2120, 3710, '21', 120, 'Bulonera del Sur', 'UN'],
    ['MAR-16', 'Martillo 16oz', 'Herramientas', 5000, null, '21', 5, 'Stanley Arg.', 'UN'],
    ['LLA-10', 'Llave 10 mm', 'Herramientas', 3000, 5400, '21', null, null, 'UN'],
    ['LLA-10', 'Llave 10 mm (otra)', 'Herramientas', 3000, 5400, '21', null, null, 'UN'],
    ['ALA-17', 'Alambre N°17', 'Alambres', 2000, 4150, 'EX', 3, null, 'ROLLO'],
    ['PIN-4', 'Pintura látex 4 l', 'Pinturería', null, 21300, '21', 10, null, 'UN'],
  ];

  it('separa nuevos, actualizaciones y errores con su motivo', () => {
    const plan = buildPlan(grid, 0, base, refs());
    const byRow = Object.fromEntries(plan.rows.map((r) => [r.rowNumber, r]));

    expect(byRow[2]).toMatchObject({ status: 'new', price: 3237.5, taxId: 'iva21', unit: 'UNIT', stock: 48, cost: 1850 });
    expect(byRow[3]).toMatchObject({ status: 'update', oldPrice: 3150, price: 3710 });
    expect(byRow[4].messages).toEqual(['Falta el precio de venta']);
    expect(byRow[5].messages[0]).toContain('también en la fila 6');
    expect(byRow[6].messages[0]).toContain('también en la fila 5');
    expect(byRow[7].messages).toEqual(['Unidad "ROLLO" no reconocida: elegí a qué unidad corresponde']);
    expect(byRow[8].messages).toEqual(['Para cargar el stock inicial falta el costo']);

    expect(plan.newCategories).toEqual([]);
    expect(plan.newSuppliers).toEqual([]);
    expect(plan.existingSuppliers).toBe(1);
    expect(plan.unitValues.find((v) => v.raw === 'rollo')).toMatchObject({ count: 1, resolved: null });
  });

  it('aplica lo que el usuario eligió para valores no reconocidos', () => {
    const plan = buildPlan(grid, 0, { ...base, unitValues: { rollo: 'UNIT' } }, refs());
    expect(plan.rows.find((r) => r.sku === 'ALA-17')).toMatchObject({ status: 'new', unit: 'UNIT', taxId: 'exento' });
  });

  it('con "dejarlo como está", un código existente no se toca', () => {
    const plan = buildPlan(grid, 0, { ...base, onExisting: 'skip' }, refs());
    expect(plan.rows.find((r) => r.sku === 'TOR-0616')?.status).toBe('skip');
  });

  it('con precios con IVA incluido, guarda el neto', () => {
    const plan = buildPlan(grid, 0, { ...base, pricesIncludeVat: true }, refs());
    expect(plan.rows.find((r) => r.sku === 'TOR-0612')?.price).toBe(2675.62);
  });


  it('respeta los números de fila del Excel aunque haya filas vacías en el medio', () => {
    const withBlanks = [header, [], grid[1], [null, null], grid[2]];
    const plan = buildPlan(withBlanks, 0, base, refs());
    expect(plan.rows.map((r) => [r.rowNumber, r.sku])).toEqual([
      [3, 'TOR-0612'],
      [5, 'TOR-0616'],
    ]);
  });

  it('"Dejar sin IVA" importa la fila sin alícuota en vez de marcarla con error', () => {
    const noTaxes = { ...refs(), taxes: [] };
    const plan = buildPlan([header, grid[1]], 0, { ...base, taxValues: { '21': NO_TAX } }, noTaxes);
    expect(plan.rows[0]).toMatchObject({ status: 'new', taxId: null });
  });
});
