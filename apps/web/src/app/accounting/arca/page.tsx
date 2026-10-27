import { redirect } from 'next/navigation';

// Conexión con ARCA pasó a ser una sección propia del menú (/arca): la
// dirección vieja sigue funcionando para enlaces guardados y correos.
export default function OldArcaPage() {
  redirect('/arca');
}
