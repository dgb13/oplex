import { api } from '@/lib/api';

export type CompanyRoleType = 'CUSTOMER' | 'SUPPLIER' | 'BRANCH';

export type CompanyIndustry =
  | 'COMERCIO'
  | 'SERVICIOS'
  | 'INDUSTRIA'
  | 'CONSTRUCCION'
  | 'AGRO'
  | 'TECNOLOGIA'
  | 'SALUD'
  | 'EDUCACION'
  | 'GASTRONOMIA'
  | 'TRANSPORTE'
  | 'INMOBILIARIO'
  | 'OTRO';

export interface Company {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  creditLimit: string;
  pointOfSaleNumber: string | null;
  taxCondition: string | null;
  fiscalAddress: string | null;
  industry: CompanyIndustry | null;
  grossIncomeNumber: string | null;
  withholdsVat: boolean;
  withholdsIncomeTax: boolean;
  withholdsGrossIncome: boolean;
  logoUrl: string | null;
  phone: string | null;
  website: string | null;
  active: boolean;
  createdAt: string;
  roles: { role: CompanyRoleType }[];
}

export interface PreferredArticleSummary {
  id: string;
  name: string;
  imageUrl: string | null;
}

export interface Person {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string | null;
  nickname: string | null;
  email: string | null;
  whatsapp: string | null;
  avatarUrl: string | null;
  jobTitle: string | null;
}

export interface CreateCompanyInput {
  name: string;
  taxId?: string;
  email?: string;
  creditLimit?: number;
  pointOfSaleNumber?: string;
  taxCondition?: string;
  fiscalAddress?: string;
  industry?: CompanyIndustry;
  grossIncomeNumber?: string;
  withholdsVat?: boolean;
  withholdsIncomeTax?: boolean;
  withholdsGrossIncome?: boolean;
  logoUrl?: string;
  phone?: string;
  website?: string;
  roles: CompanyRoleType[];
}

export interface UpdateCompanyInput {
  name?: string;
  taxId?: string;
  email?: string;
  creditLimit?: number;
  pointOfSaleNumber?: string;
  taxCondition?: string;
  fiscalAddress?: string;
  industry?: CompanyIndustry;
  grossIncomeNumber?: string;
  withholdsVat?: boolean;
  withholdsIncomeTax?: boolean;
  withholdsGrossIncome?: boolean;
  logoUrl?: string;
  phone?: string;
  website?: string;
  roles?: CompanyRoleType[];
  active?: boolean;
}

export interface CreatePersonInput {
  companyId: string;
  firstName: string;
  lastName?: string;
  nickname?: string;
  email?: string;
  whatsapp?: string;
  avatarUrl?: string;
  jobTitle?: string;
}

export interface UpdatePersonInput {
  firstName?: string;
  lastName?: string;
  nickname?: string;
  email?: string;
  whatsapp?: string;
  avatarUrl?: string | null;
  jobTitle?: string;
}

export interface AfipPadronData {
  cuit: string;
  personType: 'FISICA' | 'JURIDICA';
  name: string;
  taxCondition: string | null;
  fiscalAddress: string | null;
}

export const companiesApi = {
  list: (role?: CompanyRoleType, includeInactive?: boolean) =>
    api
      .get<Company[]>('/companies', {
        params: {
          ...(role ? { role } : {}),
          ...(includeInactive ? { includeInactive: 'true' } : {}),
        },
      })
      .then((r) => r.data),
  get: (id: string) =>
    api
      .get<Company & { people: Person[]; preferredForArticles: PreferredArticleSummary[] }>(`/companies/${id}`)
      .then((r) => r.data),
  create: (dto: CreateCompanyInput) => api.post<Company>('/companies', dto).then((r) => r.data),
  update: (id: string, dto: UpdateCompanyInput) =>
    api.patch<Company>(`/companies/${id}`, dto).then((r) => r.data),
  listPeople: (companyId: string) =>
    api.get<Person[]>(`/companies/${companyId}/people`).then((r) => r.data),
  createPerson: (dto: CreatePersonInput) => api.post<Person>('/companies/people', dto).then((r) => r.data),
  updatePerson: (id: string, dto: UpdatePersonInput) =>
    api.patch<Person>(`/companies/people/${id}`, dto).then((r) => r.data),
  uploadPersonAvatar: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<Person>(`/companies/people/${id}/avatar`, formData).then((r) => r.data);
  },
  removePersonAvatar: (id: string) => api.delete<Person>(`/companies/people/${id}/avatar`).then((r) => r.data),
  lookupAfip: (cuit: string) =>
    api.get<AfipPadronData>(`/companies/afip/${encodeURIComponent(cuit)}`).then((r) => r.data),
  removePerson: (id: string) => api.delete(`/companies/people/${id}`).then(() => undefined),
};
