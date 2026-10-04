import { parseCsv } from '@plexo/spreadsheet-import';
import { buildCompanyPlan, type ArcaResult, type CompanyImportOptions, type CompanyRefs, type ExistingCompany } from './company-import.service.js';
import { checkTaxId, guessTaxCondition, NO_CONDITION, sameCompanyName, suggestCompanyMapping } from './company-import-fields.js';

// CUIT con dígito verificador válido (inventados).
const CUIT_A = '30-71000001-4';
const CUIT_B = '30-71000002-2';
const CUIT_C = '20-30000003-8';

function existing(partial: Partial<ExistingCompany>): ExistingCompany {
  return {
    id: 'x',
    name: '',
    taxIdDigits: null,
    roles: ['SUPPLIER'],
    active: true,
    taxCondition: null,
    fiscalAddress: null,
    phone: null,
    email: null,
    website: null,
    grossIncomeNumber: null,
    industry: null,
    creditLimit: 0,
    people: [],
    ...partial,
  };
}

const header = ['Razón Social', 'C.U.I.T.', 'Cond. IVA', 'Dirección', 'Tel.', 'E-mail', 'Contacto', 'Cel. contacto'];
const mapping = suggestCompanyMapping(header);
const base: CompanyImportOptions = { mapping, roles: ['SUPPLIER'], onExisting: 'fill', verifyArca: false };
const refs = (companies: ExistingCompany[] = [], quota: CompanyRefs['quota'] = null): CompanyRefs => ({ companies, quota });
const grid = (...rows: (string | null)[][]) => [header, ...rows];

describe('columnas y valores', () => {
  it('reconoce los encabezados de una lista exportada de otro sistema', () => {
    expect(mapping).toEqual(['name', 'taxId', 'taxCondition', 'address', 'phone', 'email', 'contact', 'contactPhone']);
  });

  it('interpreta las formas habituales de escribir la condición de IVA', () => {
    expect(guessTaxCondition('RI')).toBe('Responsable Inscripto');
    expect(guessTaxCondition('Resp. Insc.')).toBe('Responsable Inscripto');
    expect(guessTaxCondition('IVA Responsable Inscripto')).toBe('Responsable Inscripto');
    expect(guessTaxCondition('Monot.')).toBe('Monotributo');
    expect(guessTaxCondition('Responsable Monotributo')).toBe('Monotributo');
    expect(guessTaxCondition('Monotributo social')).toBe('Monotributista Social');
    expect(guessTaxCondition('EX')).toBe('Exento');
    expect(guessTaxCondition('CF')).toBe('Consumidor Final');
    expect(guessTaxCondition('RNI')).toBeNull();
  });

  it('valida el CUIT y acepta DNI', () => {
    expect(checkTaxId('30710000014')).toEqual({ kind: 'cuit', digits: '30710000014', value: CUIT_A });
    expect(checkTaxId('30-71000001-5')).toMatchObject({ kind: 'invalid' });
    expect(checkTaxId('30-7100005')).toMatchObject({ kind: 'invalid' });
    expect(checkTaxId('28.123.456')).toEqual({ kind: 'dni', digits: '28123456', value: '28123456' });
  });

  it('compara razones sociales escritas distinto', () => {
    expect(sameCompanyName('Hierros Norte S.A.', 'HIERROS NORTE SA')).toBe(true);
    expect(sameCompanyName('Pinturas Alba', 'Distribuidora Oeste SRL')).toBe(false);
  });
});

describe('buildCompanyPlan', () => {
  it('separa nuevas, errores y suma contactos de filas repetidas', () => {
    const plan = buildCompanyPlan(
      grid(
        ['Hierros Norte SA', CUIT_B, 'RI', 'Ruta 8 km 52', null, 'pedidos@hn.com.ar', 'Laura Pérez', '11 5000-0002'],
        ['Hierros Norte SA', CUIT_B, 'RI', null, null, null, 'Diego Sosa', null],
        ['Maderera San José', '30-7100005', null, null, null, null, null, null],
        [null, CUIT_C, 'Monot.', null, null, null, null, null],
        ['Agro Sur', null, 'RNI', null, null, 'no-es-mail', null, null],
      ),
      0,
      base,
      refs(),
    );
    const byRow = Object.fromEntries(plan.rows.map((r) => [r.rowNumber, r]));
    expect(byRow[2]).toMatchObject({ status: 'new', taxId: CUIT_B, taxCondition: 'Responsable Inscripto', contact: { firstName: 'Laura', lastName: 'Pérez' } });
    expect(byRow[3]).toMatchObject({ status: 'new', mergedInto: 2 });
    expect(byRow[3].notes[0]).toContain('se suma como otro contacto');
    expect(byRow[4].messages[0]).toContain('tiene que tener 11 números');
    expect(byRow[5].messages).toEqual(['Falta la razón social']);
    expect(byRow[6].messages).toEqual(['Condición de IVA "RNI" no reconocida: elegí a qué corresponde']);
    expect(byRow[6].warnings).toContain('El email "no-es-mail" no es válido: se importa sin email');
    expect(plan.contacts).toBe(2);
    expect(plan.conditionValues.find((v) => v.key === 'rni')).toMatchObject({ count: 1, resolved: null });
  });

  it('aplica lo que eligió el usuario para condiciones no reconocidas', () => {
    const rows = grid(['Agro Sur', null, 'RNI', null, null, null, null, null]);
    expect(buildCompanyPlan(rows, 0, { ...base, conditionValues: { rni: NO_CONDITION } }, refs()).rows[0]).toMatchObject({ status: 'new', taxCondition: null });
  });

  it('completa un proveedor que creó el importador de artículos (sólo nombre)', () => {
    const plan = buildCompanyPlan(
      grid(['Bulonera del Sur', CUIT_A, 'RI', 'Av. Mitre 1234', null, null, null, null]),
      0,
      base,
      refs([existing({ id: 'bul', name: 'Bulonera del Sur', phone: '011 4201-0000' })]),
    );
    expect(plan.rows[0]).toMatchObject({
      status: 'update',
      existingId: 'bul',
      updates: { taxId: CUIT_A, taxCondition: 'Responsable Inscripto', fiscalAddress: 'Av. Mitre 1234' },
    });
    expect(plan.rows[0].notes).toContain('Ya existía sin CUIT: se completan sus datos');
  });

  it('"completar lo vacío" no pisa lo cargado a mano; "reemplazar" sí', () => {
    const company = existing({ id: 'a', name: 'Hierros Norte', taxIdDigits: '30710000022', fiscalAddress: 'Calle vieja 1' });
    const rows = grid(['Hierros Norte', CUIT_B, null, 'Calle nueva 2', '0230 442-0000', null, null, null]);
    expect(buildCompanyPlan(rows, 0, base, refs([company])).rows[0].updates).toEqual({ phone: '0230 442-0000' });
    expect(buildCompanyPlan(rows, 0, { ...base, onExisting: 'replace' }, refs([company])).rows[0].updates).toEqual({
      fiscalAddress: 'Calle nueva 2',
      phone: '0230 442-0000',
    });
  });

  it('a un cliente que viene como proveedor se le suma el rol, sin duplicarlo', () => {
    const plan = buildCompanyPlan(
      grid(['Distribuidora Oeste', CUIT_A, null, null, null, null, null, null]),
      0,
      base,
      refs([existing({ id: 'oeste', name: 'Distribuidora Oeste SRL', taxIdDigits: '30710000014', roles: ['CUSTOMER'] })]),
    );
    expect(plan.rows[0]).toMatchObject({ status: 'update', addRoles: ['SUPPLIER'] });
    expect(plan.rows[0].notes).toContain('Ya es cliente: se le agrega el rol de proveedor');
    expect(plan.rolesAdded).toBe(1);
  });

  it('una empresa existente sin nada nuevo se deja como está', () => {
    const plan = buildCompanyPlan(
      grid(['Hierros Norte', CUIT_B, null, null, null, null, null, null]),
      0,
      base,
      refs([existing({ name: 'Hierros Norte', taxIdDigits: '30710000022' })]),
    );
    expect(plan.rows[0].status).toBe('skip');
  });

  it('usa lo que respondió ARCA y avisa si la razón social no coincide', () => {
    const arca = new Map<string, ArcaResult>([
      ['20300000038', { status: 'found', name: 'ALBA PINTURAS', taxCondition: 'Monotributo (D)', fiscalAddress: 'San Martín 50, Pilar' }],
      ['30710000022', { status: 'missing' }],
    ]);
    const plan = buildCompanyPlan(
      grid(['Pinturas del Oeste', CUIT_C, null, null, null, null, null, null], ['Hierros Norte', CUIT_B, null, null, null, null, null, null]),
      0,
      { ...base, verifyArca: true },
      refs(),
      arca,
    );
    expect(plan.cuits).toEqual(['20300000038', '30710000022']);
    expect(plan.rows[0]).toMatchObject({ taxCondition: 'Monotributo (D)', fiscalAddress: 'San Martín 50, Pilar' });
    expect(plan.rows[0].warnings).toEqual(['En ARCA figura como "ALBA PINTURAS". Se importa con el nombre del archivo']);
    expect(plan.rows[1].warnings).toEqual(['ARCA no tiene datos de ese CUIT']);
  });

  it('respeta el cupo de clientes del plan', () => {
    const plan = buildCompanyPlan(
      grid(['Cliente 1', null, null, null, null, null, null, null], ['Cliente 2', null, null, null, null, null, null, null]),
      0,
      { ...base, roles: ['CUSTOMER'] },
      refs([], { planName: 'Bronze', max: 10, used: 9 }),
    );
    expect(plan.rows.map((r) => r.status)).toEqual(['new', 'error']);
    expect(plan.rows[1].messages).toEqual(['Supera el límite de clientes de tu plan (Bronze: 10)']);
  });

  it('lee un CSV de Excel en castellano', () => {
    const csv = parseCsv('Razón Social;CUIT\nHierros Norte;30710000022\n');
    expect(buildCompanyPlan(csv, 0, { ...base, mapping: suggestCompanyMapping(['Razón Social', 'CUIT']) }, refs()).rows[0]).toMatchObject({
      status: 'new',
      taxId: CUIT_B,
    });
  });
});
