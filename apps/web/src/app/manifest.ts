import type { MetadataRoute } from 'next';

// Ícono de app / PWA: sale de docs/logo/oplex-brand (oplex-app-icon.svg,
// fondo Azul Oplex con el isotipo en negativo). Permite "Instalar Oplex" en
// el celular o la computadora con el ícono de marca.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Oplex',
    short_name: 'Oplex',
    description: 'ERP en la nube para pymes argentinas',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#13233F',
    theme_color: '#13233F',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
