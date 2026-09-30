import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getTenantDb, getUserRole, type CompanyRoleType, type UserRole } from '@plexo/database';

/**
 * Quién crea y edita cada tipo de empresa (decisión con el usuario,
 * 2026-09-30): clientes y proveedores están en la misma tabla (Company +
 * CompanyRole), pero los maneja gente distinta. Ver empresa = todos.
 * El front repite esta tabla en apps/web/src/lib/companies.ts para no
 * mostrar opciones que el servidor va a rechazar - si cambia acá, cambia
 * allá.
 */
export const COMPANY_ROLE_EDITORS: Record<CompanyRoleType, readonly UserRole[]> = {
  CUSTOMER: ['OWNER', 'ADMIN', 'SALES'],
  SUPPLIER: ['OWNER', 'ADMIN', 'PURCHASES', 'INVENTORY'],
  BRANCH: ['OWNER', 'ADMIN', 'SALES'],
};

/** Todos los roles que pueden escribir alguna empresa (el @Roles del
 * controller); la regla fina por tipo la aplica el servicio. */
export const COMPANY_WRITE_ROLES = ['OWNER', 'ADMIN', 'SALES', 'PURCHASES', 'INVENTORY'] as const;

const LABEL: Record<CompanyRoleType, string> = { CUSTOMER: 'clientes', SUPPLIER: 'proveedores', BRANCH: 'sucursales' };

export function canManageCompanyRole(userRole: UserRole | undefined, companyRole: CompanyRoleType): boolean {
  return !!userRole && COMPANY_ROLE_EDITORS[companyRole].includes(userRole);
}

/** Tiene que poder manejar TODOS estos tipos (alta, agregar/quitar un tipo,
 * desactivar una empresa, que la saca de todas las listas). */
export function assertCanManageAll(companyRoles: CompanyRoleType[], action: string): void {
  const role = getUserRole();
  const denied = companyRoles.find((r) => !canManageCompanyRole(role, r));
  if (denied) {
    throw new ForbiddenException(`Tu rol no puede ${action} ${LABEL[denied]}.`);
  }
}

/** Alcanza con poder manejar ALGUNO de sus tipos (datos generales y
 * contactos de una empresa que es, por ejemplo, cliente y proveedor). */
export function assertCanManageAny(companyRoles: CompanyRoleType[]): void {
  const role = getUserRole();
  if (companyRoles.length === 0) {
    // Sin tipo (no debería pasar): sólo la dirección.
    if (role === 'OWNER' || role === 'ADMIN') return;
  } else if (companyRoles.some((r) => canManageCompanyRole(role, r))) {
    return;
  }
  throw new ForbiddenException(
    `Tu rol no puede editar ${companyRoles.map((r) => LABEL[r]).join(' ni ') || 'esta empresa'}.`,
  );
}

/** Para los contactos: la regla de la empresa a la que pertenecen. */
export async function assertCanManagePersonCompany(personId: string): Promise<void> {
  const person = await getTenantDb().person.findUnique({
    where: { id: personId },
    select: { company: { select: { roles: { select: { role: true } } } } },
  });
  if (!person) {
    throw new NotFoundException('Person not found');
  }
  assertCanManageAny(person.company.roles.map((r) => r.role));
}
