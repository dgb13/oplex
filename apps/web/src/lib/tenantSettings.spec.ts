import { arcaMenuBadge } from './tenantSettings';

describe('arcaMenuBadge', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  const expiring = (days: number) => ({
    afipConfigured: true,
    afipCertExpiresAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
  });

  it('asks to connect when there is no certificate', () => {
    expect(arcaMenuBadge({ afipConfigured: false, afipCertExpiresAt: null }, now)).toBe('Conectar');
  });

  it('warns 30 days before the certificate expires, and once it did', () => {
    expect(arcaMenuBadge(expiring(31), now)).toBeNull();
    expect(arcaMenuBadge(expiring(29), now)).toBe('Vence pronto');
    expect(arcaMenuBadge(expiring(-1), now)).toBe('Vencido');
  });

  it('shows nothing while the settings load', () => {
    expect(arcaMenuBadge(undefined, now)).toBeNull();
  });
});
