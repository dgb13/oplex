import type { TenantSettingsView } from './tenant-settings.service.js';
import { resolveEmailFrom } from './resolve-email-from.js';

// resolveEmailFrom sólo mira los campos de email; el resto de la vista no
// importa para estos casos.
function baseSettings(overrides: Partial<TenantSettingsView> = {}): TenantSettingsView {
  return {
    arReminderIntervalDays: null,
    emailSenderMode: 'SHARED',
    emailFromName: null,
    emailFromLocalPart: null,
    emailCustomDomain: null,
    domainStatus: null,
    reminderTone: 'NEUTRAL',
    ...overrides,
  } as TenantSettingsView;
}

describe('resolveEmailFrom', () => {
  it('returns undefined in SHARED mode regardless of other fields', () => {
    const settings = baseSettings({
      emailSenderMode: 'SHARED',
      emailCustomDomain: 'acme.com',
      emailFromLocalPart: 'facturas',
      domainStatus: 'verified',
    });

    expect(resolveEmailFrom(settings)).toBeUndefined();
  });

  it('builds "Name <local@domain>" when CUSTOM_DOMAIN is verified and complete', () => {
    const settings = baseSettings({
      emailSenderMode: 'CUSTOM_DOMAIN',
      domainStatus: 'verified',
      emailCustomDomain: 'acme.com',
      emailFromLocalPart: 'facturas',
      emailFromName: 'Facturación Acme',
    });

    expect(resolveEmailFrom(settings)).toBe('Facturación Acme <facturas@acme.com>');
  });

  it('omits the display name when none was set', () => {
    const settings = baseSettings({
      emailSenderMode: 'CUSTOM_DOMAIN',
      domainStatus: 'verified',
      emailCustomDomain: 'acme.com',
      emailFromLocalPart: 'facturas',
      emailFromName: null,
    });

    expect(resolveEmailFrom(settings)).toBe('facturas@acme.com');
  });

  it('returns undefined while the domain is still pending verification', () => {
    const settings = baseSettings({
      emailSenderMode: 'CUSTOM_DOMAIN',
      domainStatus: 'pending',
      emailCustomDomain: 'acme.com',
      emailFromLocalPart: 'facturas',
    });

    expect(resolveEmailFrom(settings)).toBeUndefined();
  });

  it('returns undefined when verified but missing the local part', () => {
    const settings = baseSettings({
      emailSenderMode: 'CUSTOM_DOMAIN',
      domainStatus: 'verified',
      emailCustomDomain: 'acme.com',
      emailFromLocalPart: null,
    });

    expect(resolveEmailFrom(settings)).toBeUndefined();
  });
});
