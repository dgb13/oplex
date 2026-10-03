import { BadGatewayException, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, tenantContextStorage, type UserRole } from '@plexo/database';
import type { SubscriptionService } from '@plexo/subscriptions';
import { AfipLookupError, AfipNotConfiguredError, type AfipPadronPort } from './afip-padron.port.js';
import { CompaniesService } from './companies.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', role: 'OWNER', tx: db as never }, fn);
}

function runAs<T>(role: UserRole, db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', role, tx: db as never }, fn);
}

/** Empresa existente tal como la lee updateCompany (con sus tipos). */
function existingCompany(roles: string[] = ['CUSTOMER'], overrides: Record<string, unknown> = {}) {
  return {
    id: 'company-1',
    active: true,
    creditLimit: new Prisma.Decimal(0),
    roles: roles.map((role) => ({ role })),
    ...overrides,
  };
}

const stubAfipPadron: AfipPadronPort = { lookup: jest.fn() };
const stubSubscriptionService = {
  assertCanAddClient: jest.fn().mockResolvedValue(undefined),
} as unknown as SubscriptionService;

describe('CompaniesService.createCompany', () => {
  it('creates the company with a role row per requested role', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'company-1', roles: [{ role: 'CUSTOMER' }] });
    const db = { company: { create } };
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await runInTenant(db, () =>
      service.createCompany({ name: 'Acme', roles: ['CUSTOMER', 'SUPPLIER'] }),
    );

    const args = create.mock.calls[0][0];
    expect(args.data.name).toBe('Acme');
    expect(args.data.roles.createMany.data).toEqual([
      { tenantId: 'tenant-1', role: 'CUSTOMER' },
      { tenantId: 'tenant-1', role: 'SUPPLIER' },
    ]);
  });

  it('passes industry, gross income number and withholding flags through', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'company-1', roles: [{ role: 'CUSTOMER' }] });
    const db = { company: { create } };
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await runInTenant(db, () =>
      service.createCompany({
        name: 'Acme',
        roles: ['CUSTOMER'],
        industry: 'COMERCIO',
        grossIncomeNumber: '901-123456-7',
        withholdsVat: true,
        withholdsIncomeTax: false,
        withholdsGrossIncome: true,
        logoUrl: 'https://example.com/logo.png',
      }),
    );

    expect(create.mock.calls[0][0].data).toMatchObject({
      industry: 'COMERCIO',
      grossIncomeNumber: '901-123456-7',
      withholdsVat: true,
      withholdsIncomeTax: false,
      withholdsGrossIncome: true,
      logoUrl: 'https://example.com/logo.png',
    });
  });

  it('checks the client quota when the new company has a CUSTOMER role', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'company-1', roles: [{ role: 'CUSTOMER' }] });
    const db = { company: { create } };
    const subscriptionService = {
      assertCanAddClient: jest.fn().mockResolvedValue(undefined),
    } as unknown as SubscriptionService;
    const service = new CompaniesService(stubAfipPadron, subscriptionService);

    await runInTenant(db, () => service.createCompany({ name: 'Acme', roles: ['CUSTOMER'] }));

    expect(subscriptionService.assertCanAddClient).toHaveBeenCalled();
  });

  it('skips the client quota check for a company with no CUSTOMER role', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'company-1', roles: [{ role: 'SUPPLIER' }] });
    const db = { company: { create } };
    const subscriptionService = {
      assertCanAddClient: jest.fn().mockResolvedValue(undefined),
    } as unknown as SubscriptionService;
    const service = new CompaniesService(stubAfipPadron, subscriptionService);

    await runInTenant(db, () => service.createCompany({ name: 'Acme', roles: ['SUPPLIER'] }));

    expect(subscriptionService.assertCanAddClient).not.toHaveBeenCalled();
  });

  it('propagates the quota rejection without creating the company', async () => {
    const create = jest.fn();
    const db = { company: { create } };
    const failure = new Error('Alcanzaste el límite de clientes de tu plan actual (Basic Gratis: 1)');
    const subscriptionService = {
      assertCanAddClient: jest.fn().mockRejectedValue(failure),
    } as unknown as SubscriptionService;
    const service = new CompaniesService(stubAfipPadron, subscriptionService);

    await expect(
      runInTenant(db, () => service.createCompany({ name: 'Acme', roles: ['CUSTOMER'] })),
    ).rejects.toThrow(failure);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('CompaniesService.getCompany', () => {
  it('includes the articles that name this company as their preferred supplier', async () => {
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'company-1', roles: [{ role: 'SUPPLIER' }] }),
      },
      person: { findMany: jest.fn().mockResolvedValue([]) },
      article: {
        findMany: jest.fn().mockResolvedValue([{ id: 'article-1', name: 'Agua mineral 500ml', imageUrl: null }]),
      },
    };
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    const result = await runInTenant(db, () => service.getCompany('company-1'));

    expect(db.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { preferredSupplierId: 'company-1' } }),
    );
    expect(result.preferredForArticles).toEqual([
      { id: 'article-1', name: 'Agua mineral 500ml', imageUrl: null },
    ]);
  });

  it('404s when the company does not exist', async () => {
    const db = { company: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await expect(runInTenant(db, () => service.getCompany('missing'))).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('CompaniesService.updateCompany', () => {
  it('throws when the company does not exist', async () => {
    const db = { company: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await expect(
      runInTenant(db, () => service.updateCompany('missing', { name: 'x' })),
    ).rejects.toThrow(NotFoundException);
  });

  it('replaces the full role set (delete + recreate) when roles is provided', async () => {
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue(existingCompany()),
        update: jest.fn().mockResolvedValue({ id: 'company-1', roles: [{ role: 'BRANCH' }] }),
      },
      companyRole: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await runInTenant(db, () => service.updateCompany('company-1', { roles: ['BRANCH'] }));

    expect(db.companyRole.deleteMany).toHaveBeenCalledWith({ where: { companyId: 'company-1' } });
    expect(db.companyRole.createMany).toHaveBeenCalledWith({
      data: [{ tenantId: 'tenant-1', companyId: 'company-1', role: 'BRANCH' }],
    });
  });

  it('leaves roles untouched when the dto does not mention them', async () => {
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue(existingCompany()),
        update: jest.fn().mockResolvedValue({ id: 'company-1', roles: [] }),
      },
      companyRole: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await runInTenant(db, () => service.updateCompany('company-1', { name: 'New name' }));

    expect(db.companyRole.deleteMany).not.toHaveBeenCalled();
    expect(db.companyRole.createMany).not.toHaveBeenCalled();
  });

  it('deactivates a company (soft delete) by setting active: false', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'company-1', active: false });
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue(existingCompany()),
        update,
      },
    };
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await runInTenant(db, () => service.updateCompany('company-1', { active: false }));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ active: false }) }),
    );
  });

  it('passes industry, gross income number and withholding flags through', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'company-1' });
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue(existingCompany()),
        update,
      },
    };
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await runInTenant(db, () =>
      service.updateCompany('company-1', {
        industry: 'SERVICIOS',
        grossIncomeNumber: '901-123456-7',
        withholdsIncomeTax: true,
        logoUrl: 'https://example.com/logo.png',
      }),
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          industry: 'SERVICIOS',
          grossIncomeNumber: '901-123456-7',
          withholdsIncomeTax: true,
          logoUrl: 'https://example.com/logo.png',
        }),
      }),
    );
  });
});

describe('CompaniesService.createPerson', () => {
  it('throws when the company does not exist', async () => {
    const db = { company: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await expect(
      runInTenant(db, () =>
        service.createPerson({ companyId: 'missing', firstName: 'Ana' }),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a contact for a company that is only a BRANCH', async () => {
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'company-1', roles: [{ role: 'BRANCH' }] }),
      },
    };
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await expect(
      runInTenant(db, () =>
        service.createPerson({ companyId: 'company-1', firstName: 'Ana' }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows a contact for a CUSTOMER company', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'person-1', firstName: 'Ana' });
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'company-1', roles: [{ role: 'CUSTOMER' }] }),
      },
      person: { create },
    };
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await runInTenant(db, () =>
      service.createPerson({ companyId: 'company-1', firstName: 'Ana', lastName: 'García' }),
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        companyId: 'company-1',
        firstName: 'Ana',
        lastName: 'García',
      }),
    });
  });
});

describe('CompaniesService.lookupAfip', () => {
  beforeEach(() => {
    (stubAfipPadron.lookup as jest.Mock).mockReset();
  });

  it('rejects an invalid CUIT without calling AFIP', async () => {
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await expect(service.lookupAfip('20123456780')).rejects.toThrow(BadRequestException);
    expect(stubAfipPadron.lookup).not.toHaveBeenCalled();
  });

  it('maps AfipNotConfiguredError to a 400 with a clear message', async () => {
    (stubAfipPadron.lookup as jest.Mock).mockRejectedValue(new AfipNotConfiguredError());
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await expect(service.lookupAfip('20123456786')).rejects.toThrow(BadRequestException);
  });

  it('maps AfipLookupError (AFIP unreachable/erroring) to a 502', async () => {
    (stubAfipPadron.lookup as jest.Mock).mockRejectedValue(new AfipLookupError('AFIP no responde'));
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await expect(service.lookupAfip('20123456786')).rejects.toThrow(BadGatewayException);
  });

  it('maps a null result (AFIP has no record) to a 404', async () => {
    (stubAfipPadron.lookup as jest.Mock).mockResolvedValue(null);
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await expect(service.lookupAfip('20123456786')).rejects.toThrow(NotFoundException);
  });

  it('returns the padrón data on success, normalizing the CUIT first', async () => {
    const data = {
      cuit: '20123456786',
      personType: 'JURIDICA' as const,
      name: 'Acme SA',
      taxCondition: 'Responsable Inscripto',
      fiscalAddress: 'Av. Siempreviva 742, CABA',
    };
    (stubAfipPadron.lookup as jest.Mock).mockResolvedValue(data);
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await expect(service.lookupAfip('20-12345678-6')).resolves.toEqual(data);
    expect(stubAfipPadron.lookup).toHaveBeenCalledWith('20123456786');
  });
});

describe('CompaniesService.listCompanies', () => {
  it('filters to active companies by default', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = { company: { findMany } };
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await runInTenant(db, () => service.listCompanies());

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } }),
    );
  });

  it('includes inactive companies when includeInactive is true', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = { company: { findMany } };
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await runInTenant(db, () => service.listCompanies(undefined, true));

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('combines the active filter with a role filter', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = { company: { findMany } };
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await runInTenant(db, () => service.listCompanies('CUSTOMER'));

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { active: true, roles: { some: { role: 'CUSTOMER' } } },
      }),
    );
  });
});

describe('CompaniesService.deletePerson', () => {
  it('throws when the person does not exist', async () => {
    const db = { person: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await expect(runInTenant(db, () => service.deletePerson('missing'))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('deletes the person when it exists', async () => {
    const deletePerson = jest.fn().mockResolvedValue({ id: 'person-1' });
    const db = {
      person: {
        findUnique: jest.fn().mockResolvedValue({ id: 'person-1', company: { roles: [{ role: 'CUSTOMER' }] } }),
        delete: deletePerson,
      },
    };
    const service = new CompaniesService(stubAfipPadron, stubSubscriptionService);

    await runInTenant(db, () => service.deletePerson('person-1'));

    expect(deletePerson).toHaveBeenCalledWith({ where: { id: 'person-1' } });
  });
});

describe('Permisos por tipo de empresa', () => {
  const service = () => new CompaniesService(stubAfipPadron, stubSubscriptionService);
  const dbFor = (company = existingCompany()) => ({
    company: {
      create: jest.fn((args) => Promise.resolve({ id: 'new', ...args.data })),
      findUnique: jest.fn().mockResolvedValue(company),
      update: jest.fn().mockResolvedValue(company),
    },
    companyRole: { deleteMany: jest.fn(), createMany: jest.fn() },
  });

  it('Compras da de alta un proveedor, pero no un cliente', async () => {
    const db = dbFor();
    await runAs('PURCHASES', db, () => service().createCompany({ name: 'Maderera', roles: ['SUPPLIER'] }));
    expect(db.company.create).toHaveBeenCalled();

    await expect(
      runAs('PURCHASES', dbFor(), () => service().createCompany({ name: 'Cliente X', roles: ['CUSTOMER'] })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('Inventario puede dar de alta proveedores (Carga con IA)', async () => {
    const db = dbFor();
    await runAs('INVENTORY', db, () => service().createCompany({ name: 'Molinos', roles: ['SUPPLIER'] }));
    expect(db.company.create).toHaveBeenCalled();
  });

  it('Ventas no puede editar un proveedor', async () => {
    await expect(
      runAs('SALES', dbFor(existingCompany(['SUPPLIER'])), () => service().updateCompany('company-1', { email: 'a@b.com' })),
    ).rejects.toThrow('Tu rol no puede editar proveedores.');
  });

  it('Compras edita los datos generales de una empresa que es cliente y proveedor', async () => {
    const db = dbFor(existingCompany(['CUSTOMER', 'SUPPLIER']));
    await runAs('PURCHASES', db, () => service().updateCompany('company-1', { email: 'compras@proveedor.com' }));
    expect(db.company.update).toHaveBeenCalled();
  });

  it('pero no le cambia el límite de crédito (dato de cliente)', async () => {
    await expect(
      runAs('PURCHASES', dbFor(existingCompany(['CUSTOMER', 'SUPPLIER'])), () =>
        service().updateCompany('company-1', { creditLimit: 50000 }),
      ),
    ).rejects.toThrow('cambiar el límite de crédito de clientes');
  });

  it('mandar el mismo límite de crédito sin cambiarlo no cuenta como cambio', async () => {
    const db = dbFor(existingCompany(['CUSTOMER', 'SUPPLIER'], { creditLimit: new Prisma.Decimal(50000) }));
    await runAs('PURCHASES', db, () => service().updateCompany('company-1', { name: 'Nuevo nombre', creditLimit: 50000 }));
    expect(db.company.update).toHaveBeenCalled();
  });

  it('Compras no puede convertir un proveedor en cliente, ni desactivar una empresa que también es cliente', async () => {
    await expect(
      runAs('PURCHASES', dbFor(existingCompany(['SUPPLIER'])), () =>
        service().updateCompany('company-1', { roles: ['SUPPLIER', 'CUSTOMER'] }),
      ),
    ).rejects.toThrow('Tu rol no puede agregar ni quitar clientes.');
    await expect(
      runAs('PURCHASES', dbFor(existingCompany(['CUSTOMER', 'SUPPLIER'])), () =>
        service().updateCompany('company-1', { active: false }),
      ),
    ).rejects.toThrow('Tu rol no puede desactivar clientes.');
  });

  it('Compras puede sumar como proveedor a una empresa que ya era cliente (fusión por CUIT)', async () => {
    const db = dbFor(existingCompany(['CUSTOMER']));
    await runAs('PURCHASES', db, () => service().updateCompany('company-1', { roles: ['CUSTOMER', 'SUPPLIER'] }));
    expect(db.companyRole.createMany).toHaveBeenCalled();
  });

  it('Ventas sigue manejando sucursales', async () => {
    const db = dbFor();
    await runAs('SALES', db, () => service().createCompany({ name: 'Sucursal Centro', roles: ['BRANCH'], pointOfSaleNumber: '2' }));
    expect(db.company.create).toHaveBeenCalled();
  });

  it('un contador (sin permiso de escritura en Empresas) no carga contactos de un proveedor', async () => {
    const db = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: 'company-1', roles: [{ role: 'SUPPLIER' }] }) },
      person: { create: jest.fn() },
    };
    await expect(
      runAs('ACCOUNTANT', db, () => service().createPerson({ companyId: 'company-1', firstName: 'Ana' })),
    ).rejects.toThrow(ForbiddenException);
    expect(db.person.create).not.toHaveBeenCalled();
  });
});
