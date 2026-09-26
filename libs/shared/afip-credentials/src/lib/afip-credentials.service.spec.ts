import { tenantContextStorage } from '@plexo/database';
import { EncryptionService } from '@plexo/encryption';
import { AfipCredentialsService } from './afip-credentials.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeEncryption(): EncryptionService {
  process.env['ENCRYPTION_MASTER_KEY'] = '22'.repeat(32);
  return new EncryptionService();
}

describe('AfipCredentialsService.getCurrent', () => {
  it('returns null when the tenant has no certificate uploaded', async () => {
    const db = {
      tenantSettings: { findUnique: jest.fn().mockResolvedValue(null) },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ taxId: '30-71659554-9' }) },
    };
    const service = new AfipCredentialsService(makeEncryption());

    const result = await runInTenant(db, () => service.getCurrent());

    expect(result).toBeNull();
  });

  it('returns null when the tenant has a certificate but no CUIT set', async () => {
    const encryption = makeEncryption();
    const db = {
      tenantSettings: {
        findUnique: jest.fn().mockResolvedValue({
          afipEnv: 'HOMOLOGACION',
          afipCertEncrypted: encryption.encrypt('cert'),
          afipKeyEncrypted: encryption.encrypt('key'),
        }),
      },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ taxId: null }) },
    };
    const service = new AfipCredentialsService(encryption);

    const result = await runInTenant(db, () => service.getCurrent());

    expect(result).toBeNull();
  });

  it('decrypts the stored cert/key and pairs them with the tenant CUIT', async () => {
    const encryption = makeEncryption();
    const db = {
      tenantSettings: {
        findUnique: jest.fn().mockResolvedValue({
          afipEnv: 'PRODUCCION',
          afipCertEncrypted: encryption.encrypt('-----BEGIN CERTIFICATE-----'),
          afipKeyEncrypted: encryption.encrypt('-----BEGIN PRIVATE KEY-----'),
        }),
      },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ taxId: '30-71659554-9' }) },
    };
    const service = new AfipCredentialsService(encryption);

    const result = await runInTenant(db, () => service.getCurrent());

    expect(result).toEqual({
      certPem: '-----BEGIN CERTIFICATE-----',
      keyPem: '-----BEGIN PRIVATE KEY-----',
      cuitRepresentada: '30-71659554-9',
      env: 'produccion',
      ticketStore: expect.objectContaining({ load: expect.any(Function), save: expect.any(Function) }),
    });
    expect(db.tenantSettings.findUnique).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });
    expect(db.tenant.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 'tenant-1' } });
  });

  it('defaults to homologacion when afipEnv is HOMOLOGACION', async () => {
    const encryption = makeEncryption();
    const db = {
      tenantSettings: {
        findUnique: jest.fn().mockResolvedValue({
          afipEnv: 'HOMOLOGACION',
          afipCertEncrypted: encryption.encrypt('cert'),
          afipKeyEncrypted: encryption.encrypt('key'),
        }),
      },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ taxId: '30-1-1' }) },
    };
    const service = new AfipCredentialsService(encryption);

    const result = await runInTenant(db, () => service.getCurrent());

    expect(result?.env).toBe('homologacion');
  });
});
