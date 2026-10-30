'use client';

import { canManageCompanyRole, type CompanyRoleType } from '@/lib/companies';
import { profileApi } from '@/lib/profile';
import { useQuery } from '@tanstack/react-query';

/** Qué tipos de empresa puede manejar el usuario conectado (ver
 * COMPANY_ROLE_EDITORS). Mismo queryKey del perfil que AppShell/UserMenu:
 * react-query lo reusa, no hace otra consulta. Mientras carga, nada. */
export function useCompanyPermissions() {
  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const roles = profile?.roles;
  const can = (companyRole: CompanyRoleType) => canManageCompanyRole(roles, companyRole);
  return {
    loaded: !!profile,
    can,
    canAny: (roles: CompanyRoleType[]) => roles.some(can),
    canAll: (roles: CompanyRoleType[]) => roles.every(can),
  };
}
