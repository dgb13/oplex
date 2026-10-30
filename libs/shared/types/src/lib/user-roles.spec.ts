import { formatRoles, hasAnyRole, isOwnerOrAdmin, normalizeRoles } from './user-roles.js';

describe('hasAnyRole', () => {
  it('is true when any of the roles is allowed', () => {
    expect(hasAnyRole(['SALES', 'INVENTORY'], ['OWNER', 'ADMIN', 'INVENTORY'])).toBe(true);
    expect(hasAnyRole(['SALES'], ['OWNER', 'ADMIN', 'INVENTORY'])).toBe(false);
    expect(hasAnyRole(undefined, ['OWNER'])).toBe(false);
  });

  it('treats Owner and Admin as full access', () => {
    expect(isOwnerOrAdmin(['ADMIN'])).toBe(true);
    expect(isOwnerOrAdmin(['SALES', 'ACCOUNTANT'])).toBe(false);
  });
});

describe('normalizeRoles', () => {
  it('orders and de-duplicates combinable roles', () => {
    expect(normalizeRoles(['INVENTORY', 'SALES', 'SALES'])).toEqual({ ok: true, roles: ['SALES', 'INVENTORY'] });
  });

  it('rejects an empty list', () => {
    expect(normalizeRoles([])).toEqual({ ok: false, error: 'Elegí al menos un rol' });
  });

  it('keeps Owner, Admin and Viewer alone', () => {
    expect(normalizeRoles(['ADMIN'])).toEqual({ ok: true, roles: ['ADMIN'] });
    for (const exclusive of ['OWNER', 'ADMIN', 'VIEWER'] as const) {
      expect(normalizeRoles([exclusive, 'SALES']).ok).toBe(false);
    }
  });
});

describe('formatRoles', () => {
  it('shows the Spanish labels', () => {
    expect(formatRoles(['SALES', 'INVENTORY'])).toBe('Ventas, Inventario');
  });
});
