import { tenantContextStorage } from '@plexo/database';
import { EncryptionService } from '@plexo/encryption';
import forge from 'node-forge';
import type { ResendDomainsClient } from './resend-domain-client.provider.js';
import { TenantSettingsService } from './tenant-settings.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

/** Every service method now also reads Tenant.taxId (see
 * TenantSettingsService.getTenantTaxId) - this merges a default mock for it
 * into whatever `db` object a test builds, so each test only overrides
 * `tenantSettings`/`tenant` and stops paying attention to the join for
 * everything else it's not about. */
function withTenant(db: Record<string, unknown>, taxId: string | null = '20-11111111-2') {
  return {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ taxId }) },
    ...db,
  };
}

function makeDomainsClient(overrides: Partial<ResendDomainsClient> = {}): ResendDomainsClient {
  return {
    create: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    verify: jest.fn(),
    ...overrides,
  } as unknown as ResendDomainsClient;
}

// Never exercised by the non-AFIP describe blocks below - a fake is enough
// so the constructor is satisfied without needing ENCRYPTION_MASTER_KEY set.
const noopEncryption = {} as EncryptionService;

describe('TenantSettingsService.getSettings', () => {
  it('reads defaults when no row exists yet', async () => {
    const db = withTenant({ tenantSettings: { findUnique: jest.fn().mockResolvedValue(null) } }, null);
    const service = new TenantSettingsService(null, noopEncryption);

    const result = await runInTenant(db, () => service.getSettings());

    expect(db.tenantSettings.findUnique).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });
    expect(result).toEqual({
      arReminderIntervalDays: null,
      emailSenderMode: 'SHARED',
      emailFromName: null,
      emailFromLocalPart: null,
      emailCustomDomain: null,
      domainStatus: null,
      reminderTone: 'NEUTRAL',
      reminderCcEmail: null,
      withholdingAgentIncomeTax: false,
      withholdingAgentVat: false,
      withholdingAgentGrossIncome: false,
      afipEnv: 'HOMOLOGACION',
      afipConfigured: false,
      afipCertExpiresAt: null,
      afipCertAlias: null,
      afipHasPendingKey: false,
      afipPendingCsr: null,
      afipPendingAlias: null,
      afipLastCheckAt: null,
      afipLastCheckOk: null,
      afipLastCheckMessage: null,
      ownTaxCondition: null,
      fiscalAddress: null,
      grossIncomeNumber: null,
      activityStartDate: null,
      defaultMarkupPercent: null,
      tenantTaxId: null,
    });
  });

  it('reads back stored values', async () => {
    const db = withTenant({
      tenantSettings: {
        findUnique: jest.fn().mockResolvedValue({
          arReminderIntervalDays: 7,
          emailSenderMode: 'CUSTOM_DOMAIN',
          emailFromName: 'Facturación Acme',
          emailFromLocalPart: 'facturas',
          emailCustomDomain: 'acme.com',
          domainStatus: 'verified',
          reminderTone: 'FIRM',
          reminderCcEmail: 'cobranzas@acme.com',
          withholdingAgentIncomeTax: true,
          withholdingAgentVat: false,
          withholdingAgentGrossIncome: true,
          afipEnv: 'PRODUCCION',
          afipCertEncrypted: 'cert-cipher',
          afipKeyEncrypted: 'key-cipher',
          afipCertExpiresAt: new Date('2027-01-01'),
          ownTaxCondition: 'RESPONSABLE_INSCRIPTO',
        }),
      },
    });
    const service = new TenantSettingsService(null, noopEncryption);

    const result = await runInTenant(db, () => service.getSettings());

    expect(result).toEqual({
      arReminderIntervalDays: 7,
      emailSenderMode: 'CUSTOM_DOMAIN',
      emailFromName: 'Facturación Acme',
      emailFromLocalPart: 'facturas',
      emailCustomDomain: 'acme.com',
      domainStatus: 'verified',
      reminderTone: 'FIRM',
      reminderCcEmail: 'cobranzas@acme.com',
      withholdingAgentIncomeTax: true,
      withholdingAgentVat: false,
      withholdingAgentGrossIncome: true,
      afipEnv: 'PRODUCCION',
      afipConfigured: true,
      afipCertExpiresAt: new Date('2027-01-01'),
      afipCertAlias: null,
      afipHasPendingKey: false,
      afipPendingCsr: null,
      afipPendingAlias: null,
      afipLastCheckAt: null,
      afipLastCheckOk: null,
      afipLastCheckMessage: null,
      ownTaxCondition: 'RESPONSABLE_INSCRIPTO',
      fiscalAddress: null,
      grossIncomeNumber: null,
      activityStartDate: null,
      defaultMarkupPercent: null,
      tenantTaxId: '20-11111111-2',
    });
  });

  it('afipConfigured is false when the certificate is set but the tenant has no CUIT yet', async () => {
    const db = withTenant(
      {
        tenantSettings: {
          findUnique: jest.fn().mockResolvedValue({
            afipCertEncrypted: 'cert-cipher',
            afipKeyEncrypted: 'key-cipher',
          }),
        },
      },
      null,
    );
    const service = new TenantSettingsService(null, noopEncryption);

    const result = await runInTenant(db, () => service.getSettings());

    expect(result.afipConfigured).toBe(false);
    expect(result.tenantTaxId).toBeNull();
  });
});

describe('TenantSettingsService.updateTenantInfo', () => {
  it('updates Tenant.taxId and returns it in the view', async () => {
    const update = jest.fn().mockResolvedValue({});
    const db = withTenant(
      {
        tenant: { update },
        tenantSettings: { findUnique: jest.fn().mockResolvedValue(null) },
      },
      null,
    );
    const service = new TenantSettingsService(null, noopEncryption);

    const result = await runInTenant(db, () => service.updateTenantInfo({ taxId: '30-71659554-9' }));

    expect(update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { taxId: '30-71659554-9' },
    });
    expect(result.tenantTaxId).toBe('30-71659554-9');
  });
});

describe('TenantSettingsService.updateSettings', () => {
  it('upserts the row for the current tenant, creating it on first write', async () => {
    const upsert = jest.fn().mockResolvedValue({
      arReminderIntervalDays: 5,
      emailSenderMode: 'SHARED',
      emailFromName: null,
      emailFromLocalPart: null,
      emailCustomDomain: null,
      domainStatus: null,
      reminderTone: 'NEUTRAL',
    });
    const db = withTenant({ tenantSettings: { upsert } });
    const service = new TenantSettingsService(null, noopEncryption);

    const result = await runInTenant(db, () => service.updateSettings({ arReminderIntervalDays: 5 }));

    expect(upsert).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      create: {
        tenantId: 'tenant-1',
        arReminderIntervalDays: 5,
        emailSenderMode: undefined,
        emailFromName: undefined,
        emailFromLocalPart: undefined,
        reminderTone: undefined,
        reminderCcEmail: null,
        withholdingAgentIncomeTax: undefined,
        withholdingAgentVat: undefined,
        withholdingAgentGrossIncome: undefined,
        ownTaxCondition: null,
        fiscalAddress: null,
        grossIncomeNumber: null,
        activityStartDate: null,
        defaultMarkupPercent: null,
      },
      update: {
        arReminderIntervalDays: 5,
        emailSenderMode: undefined,
        emailFromName: undefined,
        emailFromLocalPart: undefined,
        reminderTone: undefined,
        reminderCcEmail: undefined,
        withholdingAgentIncomeTax: undefined,
        withholdingAgentVat: undefined,
        withholdingAgentGrossIncome: undefined,
        ownTaxCondition: undefined,
        fiscalAddress: undefined,
        grossIncomeNumber: undefined,
        activityStartDate: undefined,
        defaultMarkupPercent: undefined,
      },
    });
    expect(result.arReminderIntervalDays).toBe(5);
  });

  it('turns recurring reminders off by writing null', async () => {
    const upsert = jest.fn().mockResolvedValue({
      arReminderIntervalDays: null,
      emailSenderMode: 'SHARED',
      emailFromName: null,
      emailFromLocalPart: null,
      emailCustomDomain: null,
      domainStatus: null,
      reminderTone: 'NEUTRAL',
    });
    const db = withTenant({ tenantSettings: { upsert } });
    const service = new TenantSettingsService(null, noopEncryption);

    await runInTenant(db, () => service.updateSettings({ arReminderIntervalDays: null }));

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1' },
        create: expect.objectContaining({ arReminderIntervalDays: null }),
        update: expect.objectContaining({ arReminderIntervalDays: null }),
      }),
    );
  });

  it('saves the custom sender identity and reminder tone', async () => {
    const upsert = jest.fn().mockResolvedValue({
      arReminderIntervalDays: null,
      emailSenderMode: 'CUSTOM_DOMAIN',
      emailFromName: 'Facturación Acme',
      emailFromLocalPart: 'facturas',
      emailCustomDomain: null,
      domainStatus: null,
      reminderTone: 'FRIENDLY',
    });
    const db = withTenant({ tenantSettings: { upsert } });
    const service = new TenantSettingsService(null, noopEncryption);

    await runInTenant(db, () =>
      service.updateSettings({
        emailSenderMode: 'CUSTOM_DOMAIN',
        emailFromName: 'Facturación Acme',
        emailFromLocalPart: 'facturas',
        reminderTone: 'FRIENDLY',
      }),
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          emailSenderMode: 'CUSTOM_DOMAIN',
          emailFromName: 'Facturación Acme',
          emailFromLocalPart: 'facturas',
          reminderTone: 'FRIENDLY',
        }),
        update: expect.objectContaining({
          emailSenderMode: 'CUSTOM_DOMAIN',
          emailFromName: 'Facturación Acme',
          emailFromLocalPart: 'facturas',
          reminderTone: 'FRIENDLY',
        }),
      }),
    );
  });

  it('saves reminderCcEmail, and clears it by writing null', async () => {
    const upsert = jest.fn().mockResolvedValue({
      arReminderIntervalDays: null,
      emailSenderMode: 'SHARED',
      emailFromName: null,
      emailFromLocalPart: null,
      emailCustomDomain: null,
      domainStatus: null,
      reminderTone: 'NEUTRAL',
      reminderCcEmail: 'cobranzas@acme.com',
    });
    const db = withTenant({ tenantSettings: { upsert } });
    const service = new TenantSettingsService(null, noopEncryption);

    const result = await runInTenant(db, () =>
      service.updateSettings({ reminderCcEmail: 'cobranzas@acme.com' }),
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reminderCcEmail: 'cobranzas@acme.com' }),
        update: expect.objectContaining({ reminderCcEmail: 'cobranzas@acme.com' }),
      }),
    );
    expect(result.reminderCcEmail).toBe('cobranzas@acme.com');

    await runInTenant(db, () => service.updateSettings({ reminderCcEmail: null }));

    expect(upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reminderCcEmail: null }),
        update: expect.objectContaining({ reminderCcEmail: null }),
      }),
    );
  });

  it('saves ownTaxCondition, and clears it by writing null', async () => {
    const upsert = jest.fn().mockResolvedValue({
      arReminderIntervalDays: null,
      emailSenderMode: 'SHARED',
      emailFromName: null,
      emailFromLocalPart: null,
      emailCustomDomain: null,
      domainStatus: null,
      reminderTone: 'NEUTRAL',
      ownTaxCondition: 'MONOTRIBUTO',
    });
    const db = withTenant({ tenantSettings: { upsert } });
    const service = new TenantSettingsService(null, noopEncryption);

    const result = await runInTenant(db, () =>
      service.updateSettings({ ownTaxCondition: 'MONOTRIBUTO' }),
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ ownTaxCondition: 'MONOTRIBUTO' }),
        update: expect.objectContaining({ ownTaxCondition: 'MONOTRIBUTO' }),
      }),
    );
    expect(result.ownTaxCondition).toBe('MONOTRIBUTO');

    await runInTenant(db, () => service.updateSettings({ ownTaxCondition: null }));

    expect(upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ ownTaxCondition: null }),
        update: expect.objectContaining({ ownTaxCondition: null }),
      }),
    );
  });
});

describe('TenantSettingsService.registerCustomDomain', () => {
  it('throws when Resend is not configured in this environment', async () => {
    const service = new TenantSettingsService(null, noopEncryption);
    const db = withTenant({ tenantSettings: { findUnique: jest.fn() } });

    await expect(runInTenant(db, () => service.registerCustomDomain('acme.com'))).rejects.toThrow(
      /no está configurado/,
    );
  });

  it('creates a new Resend domain and persists its id/status', async () => {
    const create = jest.fn().mockResolvedValue({
      data: { id: 'dom_1', status: 'not_started', records: [{ record: 'SPF' }] },
      error: null,
    });
    const domains = makeDomainsClient({ create });
    const upsert = jest.fn().mockResolvedValue({});
    const db = withTenant({
      tenantSettings: { findUnique: jest.fn().mockResolvedValue(null), upsert },
    });
    const service = new TenantSettingsService(domains, noopEncryption);

    const result = await runInTenant(db, () => service.registerCustomDomain('acme.com'));

    expect(create).toHaveBeenCalledWith({ name: 'acme.com' });
    expect(upsert).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      create: {
        tenantId: 'tenant-1',
        emailCustomDomain: 'acme.com',
        resendDomainId: 'dom_1',
        domainStatus: 'not_started',
      },
      update: { emailCustomDomain: 'acme.com', resendDomainId: 'dom_1', domainStatus: 'not_started' },
    });
    expect(result).toEqual({ status: 'not_started', records: [{ record: 'SPF' }] });
  });

  it('re-fetches instead of re-creating when the same domain is already registered', async () => {
    const create = jest.fn();
    const get = jest.fn().mockResolvedValue({
      data: { id: 'dom_1', status: 'pending', records: [] },
      error: null,
    });
    const domains = makeDomainsClient({ create, get });
    const db = withTenant({
      tenantSettings: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ resendDomainId: 'dom_1', emailCustomDomain: 'acme.com' }),
        upsert: jest.fn().mockResolvedValue({}),
      },
    });
    const service = new TenantSettingsService(domains, noopEncryption);

    await runInTenant(db, () => service.registerCustomDomain('acme.com'));

    expect(create).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith('dom_1');
  });

  it('surfaces a Resend error as a BadRequestException', async () => {
    const create = jest.fn().mockResolvedValue({ data: null, error: { message: 'Domain taken' } });
    const domains = makeDomainsClient({ create });
    const db = withTenant({ tenantSettings: { findUnique: jest.fn().mockResolvedValue(null) } });
    const service = new TenantSettingsService(domains, noopEncryption);

    await expect(runInTenant(db, () => service.registerCustomDomain('acme.com'))).rejects.toThrow(
      'Domain taken',
    );
  });
});

describe('TenantSettingsService.refreshDomainStatus', () => {
  it('throws when no domain was registered yet', async () => {
    const domains = makeDomainsClient();
    const db = withTenant({ tenantSettings: { findUnique: jest.fn().mockResolvedValue(null) } });
    const service = new TenantSettingsService(domains, noopEncryption);

    await expect(runInTenant(db, () => service.refreshDomainStatus())).rejects.toThrow(
      /Todavía no registraste/,
    );
  });

  it('verifies then re-fetches, persisting the latest status', async () => {
    const verify = jest.fn().mockResolvedValue({ data: { id: 'dom_1' }, error: null });
    const get = jest.fn().mockResolvedValue({
      data: { id: 'dom_1', status: 'verified', records: [{ record: 'DKIM' }] },
      error: null,
    });
    const domains = makeDomainsClient({ verify, get });
    const upsert = jest.fn().mockResolvedValue({});
    const db = withTenant({
      tenantSettings: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ resendDomainId: 'dom_1', emailCustomDomain: 'acme.com' }),
        upsert,
      },
    });
    const service = new TenantSettingsService(domains, noopEncryption);

    const result = await runInTenant(db, () => service.refreshDomainStatus());

    expect(verify).toHaveBeenCalledWith('dom_1');
    expect(get).toHaveBeenCalledWith('dom_1');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ domainStatus: 'verified' }),
      }),
    );
    expect(result).toEqual({ status: 'verified', records: [{ record: 'DKIM' }] });
  });
});

describe('TenantSettingsService.uploadAfipCertificate / removeAfipCertificate', () => {
  // Self-signed pair generated once for the whole suite - these tests only
  // care that the service validates/encrypts/persists correctly, not about
  // AFIP's own certificate-issuance process.
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date('2026-01-01');
  cert.validity.notAfter = new Date('2027-06-15');
  const attrs = [{ name: 'commonName', value: 'tenant-1.plexo.test' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey);
  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

  const otherKeyPem = forge.pki.privateKeyToPem(forge.pki.rsa.generateKeyPair(2048).privateKey);

  function realEncryption(): EncryptionService {
    process.env['ENCRYPTION_MASTER_KEY'] = '11'.repeat(32);
    return new EncryptionService();
  }

  it('rejects an invalid certificate PEM', async () => {
    const service = new TenantSettingsService(null, realEncryption());
    const db = withTenant({ tenantSettings: { upsert: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(
      runInTenant(db, () =>
        service.uploadAfipCertificate({ certPem: 'not a cert', keyPem, env: 'HOMOLOGACION' }),
      ),
    ).rejects.toThrow(/no es un certificado/);
  });

  it('rejects a key that does not match the certificate', async () => {
    const service = new TenantSettingsService(null, realEncryption());
    const db = withTenant({ tenantSettings: { upsert: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(
      runInTenant(db, () =>
        service.uploadAfipCertificate({ certPem, keyPem: otherKeyPem, env: 'HOMOLOGACION' }),
      ),
    ).rejects.toThrow(/no corresponde al certificado/);
  });

  it('encrypts cert/key, extracts the expiry date, and never returns the plaintext', async () => {
    const encryption = realEncryption();
    const upsert = jest.fn().mockImplementation(({ create }) => Promise.resolve(create));
    const db = withTenant({ tenantSettings: { upsert, findUnique: jest.fn().mockResolvedValue(null) } });
    const service = new TenantSettingsService(null, encryption);

    const result = await runInTenant(db, () =>
      service.uploadAfipCertificate({ certPem, keyPem, env: 'PRODUCCION' }),
    );

    const savedArgs = upsert.mock.calls[0][0];
    expect(savedArgs.create.afipEnv).toBe('PRODUCCION');
    expect(savedArgs.create.afipCertExpiresAt).toEqual(new Date('2027-06-15'));
    expect(savedArgs.create.afipCertEncrypted).not.toContain('BEGIN CERTIFICATE');
    expect(encryption.decrypt(savedArgs.create.afipCertEncrypted)).toBe(certPem);
    expect(encryption.decrypt(savedArgs.create.afipKeyEncrypted)).toBe(keyPem);

    expect(result).not.toHaveProperty('afipCertEncrypted');
    expect(result).not.toHaveProperty('afipKeyEncrypted');
    // Tenant already has a CUIT (see withTenant's default) - configured
    // only goes true once both halves are in place.
    expect(result.afipConfigured).toBe(true);
  });

  it('clears the stored certificate on remove', async () => {
    const upsert = jest.fn().mockResolvedValue({
      afipEnv: 'HOMOLOGACION',
      afipCertEncrypted: null,
      afipKeyEncrypted: null,
      afipCertExpiresAt: null,
    });
    const db = withTenant({ tenantSettings: { upsert } });
    const service = new TenantSettingsService(null, realEncryption());

    const result = await runInTenant(db, () => service.removeAfipCertificate());

    expect(upsert).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      create: { tenantId: 'tenant-1' },
      update: {
        afipCertEncrypted: null,
        afipKeyEncrypted: null,
        afipCertExpiresAt: null,
        afipCertAlias: null,
        afipWsaaTicketsEncrypted: null,
        afipLastCheckAt: null,
        afipLastCheckOk: null,
        afipLastCheckMessage: null,
      },
    });
    expect(result.afipConfigured).toBe(false);
  });

  it('rejects the CSR uploaded by mistake instead of the certificate', async () => {
    const service = new TenantSettingsService(null, realEncryption());
    const db = withTenant({ tenantSettings: { upsert: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) } });
    const csrPem = '-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----';

    await expect(runInTenant(db, () => service.uploadAfipCertificate({ certPem: csrPem, keyPem }))).rejects.toThrow(
      /es el pedido \(CSR\), no el certificado/,
    );
  });

  it('rejects a production certificate when Homologación was chosen', async () => {
    const service = new TenantSettingsService(null, realEncryption());
    const db = withTenant({ tenantSettings: { upsert: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) } });

    // El certificado de prueba lo "emite" un issuer sin "Test" => producción.
    await expect(
      runInTenant(db, () => service.uploadAfipCertificate({ certPem, keyPem, env: 'HOMOLOGACION' })),
    ).rejects.toThrow(/es de PRODUCCIÓN/);
  });

  it('generates key + CSR, keeps the key pending (encrypted) and uses it when the certificate arrives without a key', async () => {
    const encryption = realEncryption();
    let stored: Record<string, unknown> = {};
    const upsert = jest.fn().mockImplementation(({ update }) => {
      stored = { ...stored, ...update };
      return Promise.resolve(stored);
    });
    const findUnique = jest.fn().mockImplementation(() => Promise.resolve(stored));
    const db = withTenant({
      tenantSettings: { upsert, findUnique },
      tenant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ taxId: '20-27040394-9', name: 'Demo Tenant' }),
      },
    });
    const service = new TenantSettingsService(null, encryption);

    const view = await runInTenant(db, () => service.generateAfipCsr('oplexhomo'));
    expect(view.afipHasPendingKey).toBe(true);
    expect(view.afipPendingAlias).toBe('oplexhomo');
    expect(view.afipPendingCsr).toContain('BEGIN CERTIFICATE REQUEST');
    expect(String(stored['afipPendingKeyEncrypted'])).not.toContain('PRIVATE KEY');

    // "ARCA" emite un certificado para ese pedido (acá, autofirmado con la
    // clave pendiente, con issuer de homologación).
    const pendingKeyPem = encryption.decrypt(String(stored['afipPendingKeyEncrypted']));
    const csr = forge.pki.certificationRequestFromPem(String(view.afipPendingCsr));
    const issued = forge.pki.createCertificate();
    issued.publicKey = csr.publicKey as forge.pki.PublicKey;
    issued.serialNumber = '02';
    issued.validity.notBefore = new Date('2026-09-26');
    issued.validity.notAfter = new Date('2028-09-25');
    issued.setSubject(csr.subject.attributes);
    issued.setIssuer([{ name: 'commonName', value: 'Computadores Test' }]);
    issued.sign(forge.pki.privateKeyFromPem(pendingKeyPem) as forge.pki.rsa.PrivateKey, forge.md.sha256.create());

    const result = await runInTenant(db, () =>
      service.uploadAfipCertificate({ certPem: forge.pki.certificateToPem(issued) }),
    );
    expect(result.afipEnv).toBe('HOMOLOGACION');
    expect(result.afipCertAlias).toBe('oplexhomo');
    expect(result.afipHasPendingKey).toBe(false);
    expect(encryption.decrypt(String(stored['afipKeyEncrypted']))).toBe(pendingKeyPem);
  });
});
