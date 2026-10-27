import type { PrismaService } from '@plexo/database';
import type { AssetFieldDef } from '../customer-assets/asset-fields.js';
import { catalogKey, VehicleCatalogService } from './vehicle-catalog.service.js';

const FIELDS: AssetFieldDef[] = [
  { key: 'patente', label: 'Patente', type: 'TEXT', isIdentifier: true, required: true },
  { key: 'marca', label: 'Marca', type: 'VEHICLE_BRAND', vehicleKind: 'AUTO' },
  { key: 'modelo', label: 'Modelo', type: 'VEHICLE_MODEL' },
];

const BRANDS = [
  { id: 'b1', vehicleKind: 'AUTO', name: 'Citroën', models: [{ id: 'm1', name: 'C4 Cactus' }] },
  { id: 'b2', vehicleKind: 'AUTO', name: 'Toyota', models: [{ id: 'm2', name: 'Hilux' }] },
];

function makePrisma() {
  return {
    vehicleBrand: { findMany: jest.fn().mockResolvedValue(BRANDS) },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
}

/** Valores interpolados del INSERT de vehicle_catalog_suggestions. */
function suggested(prisma: ReturnType<typeof makePrisma>) {
  return prisma.$executeRaw.mock.calls.map((call: unknown[]) => {
    const [, kind, field, brandName, text, matchKey] = call;
    return { kind, field, brandName, text, matchKey };
  });
}

describe('catalogKey', () => {
  it('ignores case, accents and extra spaces', () => {
    expect(catalogKey('  CITROEN   c4-cactus ')).toBe(catalogKey('Citroën C4 Cactus'));
  });
});

describe('VehicleCatalogService.recordHandTyped', () => {
  it('records nothing when brand and model are in the list, however they were typed', async () => {
    const prisma = makePrisma();
    const service = new VehicleCatalogService(prisma as unknown as PrismaService);
    await service.recordHandTyped(FIELDS, { patente: 'AB123CD', marca: 'citroen', modelo: 'c4 cactus' }, 't1');
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('records a model missing from a brand that is in the list', async () => {
    const prisma = makePrisma();
    const service = new VehicleCatalogService(prisma as unknown as PrismaService);
    await service.recordHandTyped(FIELDS, { patente: 'AB123CD', marca: 'Toyota', modelo: 'Hilux SRV' }, 't1');
    expect(suggested(prisma)).toEqual([
      { kind: 'AUTO', field: 'MODEL', brandName: 'Toyota', text: 'Hilux SRV', matchKey: 'AUTO|MODEL|toyota|hilux srv' },
    ]);
  });

  it('records both brand and model when the brand is new', async () => {
    const prisma = makePrisma();
    const service = new VehicleCatalogService(prisma as unknown as PrismaService);
    await service.recordHandTyped(FIELDS, { patente: 'AB123CD', marca: 'Geely', modelo: 'Coolray' }, 't1');
    expect(suggested(prisma).map((s) => s.matchKey)).toEqual(['AUTO|BRAND||geely', 'AUTO|MODEL|geely|coolray']);
  });

  it('does nothing for a ficha without the brand list', async () => {
    const prisma = makePrisma();
    const service = new VehicleCatalogService(prisma as unknown as PrismaService);
    const text = FIELDS.map((f) => ({ ...f, type: 'TEXT' as const }));
    await service.recordHandTyped(text, { patente: 'AB123CD', marca: 'Geely' }, 't1');
    expect(prisma.vehicleBrand.findMany).not.toHaveBeenCalled();
  });
});
