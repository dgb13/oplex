import { randomUUID } from 'node:crypto';
import { appPool, asTenant, insertRow, newId } from './rls-test-client.js';

/**
 * Vector 5: los 2 SECURITY DEFINER nuevos del módulo para estudios contables
 * (`list_studio_memberships()`, `find_tenant_by_tax_id()` - migraciones
 * 20260920000000_tenant_membership/20260921000000_membership_invites), con
 * cobertura real contra Postgres. Prometido en el plan original de Fase 1
 * ("mismo espíritu que cross-tenant-write.rls-spec.ts") pero nunca
 * entregado a este nivel - hasta ahora sólo tenían tests unitarios con
 * `$queryRaw` mockeado (memberships.service.spec.ts), que prueban la lógica
 * del SERVICE asumiendo que la función SQL se comporta bien, pero no
 * prueban la función SQL en sí.
 *
 * A diferencia de cross-tenant-write (que prueba que RLS RECHAZA algo),
 * estas funciones son SECURITY DEFINER a propósito - RLS no aplica dentro
 * de ellas, por diseño (ver el comentario de cada migración). Lo que sí es
 * una propiedad real y verificable acá es que cada función filtra
 * correctamente por el parámetro que recibe y nunca devuelve de más - un
 * bug futuro en el WHERE/JOIN de cualquiera de las dos (ej. al agregar el
 * reparto de cartera en la Fase 2) rompería el aislamiento entre estudios o
 * entre tenants sin que ningún test unitario mockeado lo detecte.
 */
describe('RLS SECURITY DEFINER functions (list_studio_memberships / find_tenant_by_tax_id)', () => {
  let clientA: string;
  let clientB: string;
  let studioHomeA: string;
  let studioHomeB: string;
  let membershipAId: string;
  let membershipBId: string;
  const taxIdA = '20111111111';
  const taxIdB = '20222222222';

  beforeAll(async () => {
    clientA = randomUUID();
    clientB = randomUUID();
    studioHomeA = randomUUID();
    studioHomeB = randomUUID();
    membershipAId = newId();
    membershipBId = newId();

    await asTenant(clientA, (client) =>
      insertRow(client, 'tenants', clientA, { name: 'RLS Client A', taxId: taxIdA }),
    );
    await asTenant(clientB, (client) =>
      insertRow(client, 'tenants', clientB, { name: 'RLS Client B', taxId: taxIdB }),
    );
    await asTenant(studioHomeA, (client) => insertRow(client, 'tenants', studioHomeA, { name: 'RLS Studio A' }));
    await asTenant(studioHomeB, (client) => insertRow(client, 'tenants', studioHomeB, { name: 'RLS Studio B' }));

    // tenant_memberships vive scoped al tenant CLIENTE - asTenant(clientX)
    // es el contexto correcto para crearla, igual que MembershipsService.
    await asTenant(clientA, (client) =>
      insertRow(client, 'tenant_memberships', membershipAId, {
        tenantId: clientA,
        homeTenantId: studioHomeA,
        direction: 'CLIENT_INVITED',
        status: 'ACCEPTED',
        initiatedByUserId: newId(),
      }),
    );
    await asTenant(clientB, (client) =>
      insertRow(client, 'tenant_memberships', membershipBId, {
        tenantId: clientB,
        homeTenantId: studioHomeB,
        direction: 'CLIENT_INVITED',
        status: 'ACCEPTED',
        initiatedByUserId: newId(),
      }),
    );
  });

  afterAll(async () => {
    // A diferencia del resto de este suite (que deja las filas de `tenants`
    // sembradas), esta base es la misma que se usa para pruebas manuales en
    // vivo durante esta sesión - se limpia todo explícitamente.
    for (const clientTenantId of [clientA, clientB]) {
      await asTenant(clientTenantId, (client) => client.query(`DELETE FROM tenant_memberships WHERE "tenantId" = $1`, [clientTenantId]));
    }
    for (const tenantId of [clientA, clientB, studioHomeA, studioHomeB]) {
      await asTenant(tenantId, (client) => client.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]));
    }
    await appPool.end();
  });

  describe('list_studio_memberships', () => {
    it('devuelve sólo la membership del estudio pedido, nunca la de otro estudio', async () => {
      const { rows } = await asTenant(studioHomeA, (client) =>
        client.query<{ id: string; tenant_id: string }>(`SELECT * FROM list_studio_memberships($1)`, [studioHomeA]),
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(membershipAId);
      expect(rows[0].tenant_id).toBe(clientA);
      expect(rows.some((r) => r.id === membershipBId)).toBe(false);
    });

    it('devuelve vacío para un estudio sin ninguna membership', async () => {
      const strangerTenantId = randomUUID();
      const { rows } = await asTenant(clientA, (client) =>
        client.query(`SELECT * FROM list_studio_memberships($1)`, [strangerTenantId]),
      );

      expect(rows).toHaveLength(0);
    });
  });

  describe('find_tenant_by_tax_id', () => {
    it('resuelve el CUIT exacto al tenant correcto, no a otro con distinto CUIT', async () => {
      const { rows } = await asTenant(clientA, (client) =>
        client.query<{ tenant_id: string; tenant_name: string }>(`SELECT * FROM find_tenant_by_tax_id($1)`, [
          taxIdA,
        ]),
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].tenant_id).toBe(clientA);
      expect(rows[0].tenant_name).toBe('RLS Client A');
    });

    it('normaliza guiones/espacios antes de comparar (mismo CUIT, distinto formato)', async () => {
      const formatted = `${taxIdB.slice(0, 2)}-${taxIdB.slice(2, 10)}-${taxIdB.slice(10)}`;
      const { rows } = await asTenant(clientA, (client) =>
        client.query<{ tenant_id: string }>(`SELECT * FROM find_tenant_by_tax_id($1)`, [formatted]),
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].tenant_id).toBe(clientB);
    });

    it('devuelve vacío para un CUIT que no pertenece a ningún tenant', async () => {
      const { rows } = await asTenant(clientA, (client) =>
        client.query(`SELECT * FROM find_tenant_by_tax_id($1)`, ['20999999999']),
      );

      expect(rows).toHaveLength(0);
    });
  });
});
