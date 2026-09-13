'use client';

import { Button } from '@/components/ui/button';
import { companiesApi, type Company } from '@/lib/companies';
import { useQuery } from '@tanstack/react-query';
import { ContactRow, NewPersonForm } from './CompanyDetailModal';

interface Props {
  company: Company;
  onClose: () => void;
}

/** Paso de onboarding mostrado justo después de crear un proveedor (ver
 * CompanyListView) - separado de CompanyDetailModal (que muestra roles/CUIT/
 * edición/etc., demasiado para este momento puntual) para que el usuario
 * pueda cargar de una vez a las personas con las que realmente va a hablar,
 * sin tener que volver a entrar a la ficha después. Reusa ContactRow/
 * NewPersonForm tal cual (foto de perfil por archivo/URL incluida vía
 * PersonAvatarModal), no duplica esa lógica. */
export default function AddContactsModal({ company, onClose }: Props) {
  const { data: detail } = useQuery({
    queryKey: ['company', company.id],
    queryFn: () => companiesApi.get(company.id),
  });
  const people = detail?.people ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-card p-6 shadow-2xl">
        <h2 className="text-lg font-semibold">
          Agregar contactos de {company.name}
        </h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          Cargá a las personas con las que realmente vas a trabajar en esta empresa - podés agregar
          varias, cada una con su foto de perfil (o sin ella).
        </p>

        <div className="mb-4 flex flex-col gap-2">
          {people.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no agregaste ningún contacto</p>
          ) : (
            people.map((person) => (
              <ContactRow key={person.id} person={person} companyId={company.id} />
            ))
          )}
        </div>

        <NewPersonForm companyId={company.id} />

        <Button type="button" variant="outline" className="mt-6 w-full" onClick={onClose}>
          {people.length === 0 ? 'Omitir' : 'Listo, terminar'}
        </Button>
      </div>
    </div>
  );
}
