import { Prisma } from '../generated/client.js';
import { resolveCurrentTaxDefinition, resolveCurrentTaxDefinitions } from './tax-definitions.js';

function makeDefinition(id: string, code: string, rate: number, validFrom: string, validTo: string | null = null) {
  return {
    id,
    tenantId: 'tenant-1',
    code,
    name: code,
    calculationType: 'PERCENTAGE',
    rate: new Prisma.Decimal(rate),
    fixedAmount: null,
    formula: null,
    validFrom: new Date(validFrom),
    validTo: validTo ? new Date(validTo) : null,
    managedByAccountant: false,
  } as never;
}

describe('resolveCurrentTaxDefinition', () => {
  const old = makeDefinition('iva-old', 'IVA21', 21.5, '2026-07-27', '2026-10-02');
  const current = makeDefinition('iva-new', 'IVA21', 21, '2026-10-02');

  it('devuelve la versión vigente por code, no la guardada en el artículo', async () => {
    const findFirst = jest.fn().mockResolvedValue(current);
    const asOf = new Date('2026-10-03');

    const result = await resolveCurrentTaxDefinition({ taxDefinition: { findFirst } } as never, old, asOf);

    expect(result).toBe(current);
    expect(findFirst).toHaveBeenCalledWith({
      where: { code: { in: ['IVA21'] }, validFrom: { lte: asOf }, OR: [{ validTo: null }, { validTo: { gt: asOf } }] },
      orderBy: { validFrom: 'desc' },
    });
  });

  it('sin versión vigente, usa la guardada (como antes)', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);

    const result = await resolveCurrentTaxDefinition({ taxDefinition: { findFirst } } as never, old);

    expect(result).toBe(old);
  });

  it('un artículo sin impuesto sigue sin impuesto, sin consultar', async () => {
    const findFirst = jest.fn();

    expect(await resolveCurrentTaxDefinition({ taxDefinition: { findFirst } } as never, null)).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe('resolveCurrentTaxDefinitions', () => {
  it('resuelve muchos artículos con una consulta, quedándose con la versión más nueva de cada code', async () => {
    const ivaOld = makeDefinition('iva-old', 'IVA21', 21.5, '2026-07-27', '2026-10-02');
    const ivaNew = makeDefinition('iva-new', 'IVA21', 21, '2026-10-02');
    const iibb = makeDefinition('iibb', 'IIBB', 3, '2026-01-01');
    // Ordenadas por validFrom desc, como las devuelve la consulta.
    const findMany = jest.fn().mockResolvedValue([ivaNew, iibb]);

    const result = await resolveCurrentTaxDefinitions({ taxDefinition: { findMany } } as never, [ivaOld, ivaNew, null, iibb]);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(result.get('iva-old')).toBe(ivaNew);
    expect(result.get('iva-new')).toBe(ivaNew);
    expect(result.get('iibb')).toBe(iibb);
  });

  it('sin artículos con impuesto no consulta', async () => {
    const findMany = jest.fn();

    const result = await resolveCurrentTaxDefinitions({ taxDefinition: { findMany } } as never, [null, null]);

    expect(result.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
