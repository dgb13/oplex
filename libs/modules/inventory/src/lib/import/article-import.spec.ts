import { buildPlan, detectHeaderRow, isPrivateAddress, NO_TAX, type ImportOptions, type Refs } from '../article-import.service.js';
import { parseCsv } from '@plexo/spreadsheet-import';
import { directImageUrl, guessLengthUnit, guessTax, guessUnit, parseNumber, suggestMapping } from './import-fields.js';
import { ServiceUnavailableException } from '@nestjs/common';
import { CategoryAiService } from './category-ai.service.js';

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


  describe('costo real según la condición frente al IVA', () => {
    const withCondition = (taxCondition: Refs['taxCondition']) => ({ ...refs(), taxCondition });
    const costOf = (sku: string, options: ImportOptions, r: Refs) =>
      buildPlan(grid, 0, options, r).rows.find((row) => row.sku === sku)?.cost;

    it('sin condición cargada, el costo queda como viene', () => {
      expect(costOf('TOR-0612', { ...base, costsIncludeVat: true }, refs())).toBe(1850);
    });

    it('monotributista con costos sin IVA: le suma el IVA del artículo', () => {
      expect(costOf('TOR-0612', base, withCondition('MONOTRIBUTO'))).toBe(2238.5);
    });

    it('Responsable Inscripto con costos con IVA: se lo saca', () => {
      expect(costOf('TOR-0612', { ...base, costsIncludeVat: true }, withCondition('RESPONSABLE_INSCRIPTO'))).toBe(1528.93);
    });

    it('un artículo exento no cambia', () => {
      expect(costOf('ALA-17', { ...base, unitValues: { rollo: 'UNIT' } }, withCondition('MONOTRIBUTO'))).toBe(2000);
    });

    it('monotributista: el precio de venta es final, no se le saca IVA aunque el archivo diga que lo incluye', () => {
      const plan = buildPlan(grid, 0, { ...base, pricesIncludeVat: true }, withCondition('MONOTRIBUTO'));
      expect(plan.rows.find((r) => r.sku === 'TOR-0612')?.price).toBe(3237.5);
    });
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

describe('barras, planchas y fotos', () => {
  const header = ['Código', 'Nombre', 'Precio', 'Costo', 'Existencia', 'Largo', 'Foto'];
  const mapping = suggestMapping(header);
  const base: ImportOptions = { mapping, onExisting: 'update', pricesIncludeVat: false, lengthUnit: 'm' };

  it('reconoce las columnas nuevas', () => {
    expect(mapping).toEqual(['sku', 'name', 'price', 'cost', 'stock', 'barLength', 'imageUrl']);
  });

  it('una barra con largo en metros se guarda en milímetros, precio por barra', () => {
    const grid = [header, ['CAN-20', 'Caño 20x20', 45000, 30000, 12, 6, 'https://ejemplo.com/cano.jpg']];
    const row = buildPlan(grid, 0, base, refs()).rows[0];
    expect(row).toMatchObject({ status: 'new', measurementType: 'LINEAL_1D', barLengthMm: 6000, price: 45000, stock: 12 });
    expect(row.imageUrl).toBe('https://ejemplo.com/cano.jpg');
  });

  it('con precio y existencia por metro, los pasa a barras enteras', () => {
    const grid = [header, ['CAN-20', 'Caño 20x20', 7500, 5000, 72, 6, null]];
    expect(buildPlan(grid, 0, { ...base, perMeter: true }, refs()).rows[0]).toMatchObject({
      status: 'new',
      price: 45000,
      cost: 30000,
      stock: 12,
    });
  });

  it('marca la existencia que no da barras enteras', () => {
    const grid = [header, ['CAN-20', 'Caño 20x20', 7500, 5000, 70, 6, null]];
    expect(buildPlan(grid, 0, { ...base, perMeter: true }, refs()).rows[0].messages).toEqual([
      'La existencia (70 m) no da barras enteras de 6 m',
    ]);
  });

  it('una plancha necesita ancho y largo', () => {
    const h = ['Código', 'Nombre', 'Precio', 'Ancho plancha', 'Largo plancha'];
    const opts = { ...base, mapping: suggestMapping(h) };
    expect(buildPlan([h, ['CH-1', 'Chapa', 90000, 1.22, 2.44]], 0, opts, refs()).rows[0]).toMatchObject({
      measurementType: 'SURFACE_2D',
      sheetWidthMm: 1220,
      sheetLengthMm: 2440,
    });
    expect(buildPlan([h, ['CH-1', 'Chapa', 90000, 1.22, null]], 0, opts, refs()).rows[0].messages).toEqual([
      'Para una plancha hacen falta el ancho y el largo',
    ]);
  });

  it('un link de foto inválido es un aviso, no un error', () => {
    const row = buildPlan([header, ['X-1', 'Algo', 100, null, null, null, 'foto.jpg']], 0, base, refs()).rows[0];
    expect(row.status).toBe('new');
    expect(row.warnings).toEqual(['El link de la foto no empieza con http: se importa sin foto']);
  });

  it('sugiere la unidad de los largos', () => {
    expect(guessLengthUnit([6, 6, 3.2])).toBe('m');
    expect(guessLengthUnit([600, 300])).toBe('cm');
    expect(guessLengthUnit([6000, 3000])).toBe('mm');
  });

  it('pasa los links compartidos de Drive y Dropbox a descarga directa', () => {
    expect(directImageUrl('https://drive.google.com/file/d/1AbC-xyz/view?usp=sharing')).toBe(
      'https://drive.google.com/uc?export=download&id=1AbC-xyz',
    );
    expect(directImageUrl('https://www.dropbox.com/s/abc/foto.jpg?dl=0')).toBe('https://www.dropbox.com/s/abc/foto.jpg?dl=1');
  });

  it('no deja bajar fotos de direcciones internas', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.10', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
  });
});

describe('largo comercial distinto por artículo', () => {
  const header = ['Código', 'Nombre', 'Precio', 'Costo', 'Existencia', 'Largo comercial'];
  const base: ImportOptions = { mapping: suggestMapping(header), onExisting: 'update', pricesIncludeVat: false, lengthUnit: 'm', perMeter: true };

  it('cada barra usa su propio largo: acero 6 m, plástico 2 m, eléctrico 1 m', () => {
    const grid = [
      header,
      ['AC-1', 'Caño acero', 1000, 800, 12, 6],
      ['PL-1', 'Perfil plástico', 1000, 800, 4, 2],
      ['EL-1', 'Cablecanal', 1000, 800, 3, 1],
    ];
    const rows = buildPlan(grid, 0, base, refs()).rows;
    expect(rows.map((r) => [r.sku, r.barLengthMm, r.price, r.cost, r.stock])).toEqual([
      ['AC-1', 6000, 6000, 4800, 2],
      ['PL-1', 2000, 2000, 1600, 2],
      ['EL-1', 1000, 1000, 800, 3],
    ]);
  });
});

describe('categorías sugeridas con IA', () => {
  const header = ['Código', 'Nombre', 'Precio', 'Rubro'];
  const base: ImportOptions = { mapping: suggestMapping(header), onExisting: 'update', pricesIncludeVat: false };
  const grid = [
    header,
    ['T-1', 'Tornillo', 100, null],
    ['T-2', 'Tuerca', 100, 'Bulonería'],
    ['TOR-0616', 'Tornillo existente', 100, null],
  ];

  it('sólo completan artículos nuevos que vienen sin categoría', () => {
    const aiCategories = { 't-1': 'Tornillos', 't-2': 'Otra', 'tor-0616': 'Otra' };
    const rows = buildPlan(grid, 0, { ...base, aiCategories }, refs()).rows;
    expect(rows.map((r) => [r.sku, r.category, r.categoryFromAi])).toEqual([
      ['T-1', 'Tornillos', true],
      ['T-2', 'Bulonería', false],
      ['TOR-0616', null, false],
    ]);
    expect(buildPlan(grid, 0, { ...base, aiCategories }, refs()).newCategories).toEqual(['Tornillos']);
  });
});

describe('CategoryAiService', () => {
  function client(items: unknown) {
    return { messages: { create: jest.fn().mockResolvedValue({ stop_reason: 'tool_use', content: [{ type: 'tool_use', input: { items } }] }) } };
  }

  it('devuelve código -> categoría y unifica mayúsculas con las existentes', async () => {
    const mock = client([
      { n: 1, category: 'bulonería' },
      { n: 2, category: 'Caños' },
      { n: 3, category: 'caños' },
    ]);
    const service = new CategoryAiService(mock as never);
    const result = await service.suggest(
      [
        { sku: 'T-1', name: 'Tornillo' },
        { sku: 'C-1', name: 'Caño 20' },
        { sku: 'C-2', name: 'Caño 30' },
      ],
      ['Bulonería'],
    );
    expect(result).toEqual({ 't-1': 'Bulonería', 'c-1': 'Caños', 'c-2': 'Caños' });
  });

  it('sin clave configurada responde 503', async () => {
    await expect(new CategoryAiService(null).suggest([{ sku: 'A', name: 'a' }], [])).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('si la API falla responde 503', async () => {
    const mock = { messages: { create: jest.fn().mockRejectedValue(new Error('boom')) } };
    await expect(new CategoryAiService(mock as never).suggest([{ sku: 'A', name: 'a' }], [])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
