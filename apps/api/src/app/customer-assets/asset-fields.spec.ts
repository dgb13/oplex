import {
  assertVehicleFields,
  cleanValues,
  identifierKey,
  mergeFieldDefs,
  pluralize,
  type AssetFieldDef,
} from './asset-fields.js';

const VEHICULO: AssetFieldDef[] = [
  { key: 'patente', label: 'Patente', type: 'TEXT', required: true, isIdentifier: true },
  { key: 'marca', label: 'Marca', type: 'TEXT', required: true },
  { key: 'km', label: 'Kilómetros', type: 'NUMBER' },
  { key: 'combustible', label: 'Combustible', type: 'SELECT', options: ['Nafta', 'Diésel', 'GNC'] },
  { key: 'vtv', label: 'VTV vence', type: 'DATE' },
  { key: 'gnc', label: 'Equipo de GNC', type: 'BOOLEAN' },
];

describe('identifierKey', () => {
  it('matches a plate however it was typed', () => {
    expect(identifierKey('aa 000-zz')).toBe('AA000ZZ');
    expect(identifierKey('AA000ZZ')).toBe('AA000ZZ');
  });
});

describe('pluralize', () => {
  it('builds the menu name from the ficha name', () => {
    expect(pluralize('Vehículo')).toBe('Vehículos');
    expect(pluralize('Reloj')).toBe('Relojes');
    expect(pluralize('Obra / domicilio')).toBe('Obras / domicilios');
  });
});

describe('cleanValues', () => {
  it('validates each field by its type and drops unknown keys', () => {
    expect(
      cleanValues(VEHICULO, {
        patente: ' AA000ZZ ',
        marca: 'Volkswagen',
        km: '98.500',
        combustible: 'Nafta',
        vtv: '2027-03-01',
        gnc: true,
        otro: 'x',
      }),
    ).toEqual({ patente: 'AA000ZZ', marca: 'Volkswagen', km: 98500, combustible: 'Nafta', vtv: '2027-03-01', gnc: true });
  });

  it('asks for required fields and rejects values outside a list', () => {
    expect(() => cleanValues(VEHICULO, { marca: 'Fiat' })).toThrow('Falta "Patente"');
    expect(() => cleanValues(VEHICULO, { patente: 'A', marca: 'Fiat', combustible: 'Eléctrico' })).toThrow(
      'no es una opción de "Combustible"',
    );
    expect(() => cleanValues(VEHICULO, { patente: 'A', marca: 'Fiat', km: 'mucho' })).toThrow('tiene que ser un número');
  });

  it('keeps what a hidden field already had', () => {
    const fields = VEHICULO.map((f) => (f.key === 'km' ? { ...f, hidden: true } : f));
    expect(cleanValues(fields, { patente: 'A', marca: 'Fiat', km: 5 }, { km: 120000 })).toMatchObject({ km: 120000 });
  });
});

describe('mergeFieldDefs', () => {
  it('adds new fields with a key from their name and hides (never deletes) the ones left out', () => {
    const result = mergeFieldDefs(VEHICULO, [
      { key: 'patente', label: 'Dominio', type: 'TEXT' },
      { key: 'marca', label: 'Marca', type: 'TEXT', required: true },
      { key: '', label: 'Color', type: 'TEXT' },
    ]);
    expect(result.find((f) => f.key === 'patente')).toMatchObject({ label: 'Dominio', isIdentifier: true, required: true });
    expect(result.find((f) => f.label === 'Color')).toMatchObject({ key: 'color', type: 'TEXT' });
    expect(result.find((f) => f.key === 'km')).toMatchObject({ hidden: true });
  });

  it('does not let the main field be hidden, nor a field with data change its type', () => {
    expect(mergeFieldDefs(VEHICULO, [{ key: 'patente', label: 'Patente', type: 'TEXT', hidden: true }]).find((f) => f.key === 'patente'))
      .not.toHaveProperty('hidden');
    expect(() => mergeFieldDefs(VEHICULO, [{ key: 'km', label: 'Kilómetros', type: 'TEXT' }, VEHICULO[0]])).toThrow(
      'No se puede cambiar el tipo',
    );
  });

  it('a list needs at least one option', () => {
    expect(() => mergeFieldDefs(VEHICULO, [VEHICULO[0], { key: '', label: 'Tracción', type: 'SELECT', options: [] }])).toThrow(
      'cargá al menos una opción',
    );
  });
});

describe('marca y modelo de la lista de vehículos', () => {
  const LISTA: AssetFieldDef[] = [
    { key: 'patente', label: 'Patente', type: 'TEXT', required: true, isIdentifier: true },
    { key: 'marca', label: 'Marca', type: 'VEHICLE_BRAND', vehicleKind: 'AUTO', required: true },
    { key: 'modelo', label: 'Modelo', type: 'VEHICLE_MODEL' },
  ];

  it('stores them as text, also when typed by hand', () => {
    expect(cleanValues(LISTA, { patente: 'AB 123 CD', marca: ' Chery ', modelo: 'Tiggo 4' })).toEqual({
      patente: 'AB 123 CD',
      marca: 'Chery',
      modelo: 'Tiggo 4',
    });
  });

  it('lets a text field switch to the list and back, but not to a number', () => {
    const text = LISTA.map((f) => (f.isIdentifier ? f : { ...f, type: 'TEXT' as const, vehicleKind: undefined }));
    const toList = mergeFieldDefs(text, LISTA);
    expect(toList.find((f) => f.key === 'marca')).toMatchObject({ type: 'VEHICLE_BRAND', vehicleKind: 'AUTO' });
    expect(mergeFieldDefs(LISTA, text).find((f) => f.key === 'marca')?.vehicleKind).toBeUndefined();
    expect(() =>
      mergeFieldDefs(LISTA, LISTA.map((f) => (f.key === 'marca' ? { ...f, type: 'NUMBER' as const } : f))),
    ).toThrow('No se puede cambiar el tipo del campo "Marca"');
  });

  it('defaults the brand list to cars', () => {
    const fields = mergeFieldDefs([LISTA[0]], LISTA.map((f) => ({ ...f, vehicleKind: undefined })));
    expect(fields.find((f) => f.key === 'marca')?.vehicleKind).toBe('AUTO');
  });

  it('needs the brand for the model, and only one brand', () => {
    expect(() => assertVehicleFields(LISTA.filter((f) => f.key !== 'marca'))).toThrow('"Modelo" muestra los modelos según la marca');
    expect(() => assertVehicleFields([...LISTA, { key: 'marca2', label: 'Otra marca', type: 'VEHICLE_BRAND' }])).toThrow(
      'un solo campo con la lista de marcas',
    );
    expect(() => assertVehicleFields(LISTA)).not.toThrow();
  });
});
