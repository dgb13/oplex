import './globals.css';
import { DensityProvider } from '@/providers/DensityProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { SITE_URL } from '@/lib/site';

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

// metadataBase resuelve las URLs relativas de canonical/openGraph contra el
// dominio público. Acá NO va `alternates.canonical`: se heredaría a todas las
// páginas (tiendas, legales, manual) y Google las tomaría como copias de la
// portada. Cada página pública declara la suya.
export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Oplex',
  description: 'Oplex: ERP en la nube para pymes argentinas.',
  applicationName: 'Oplex',
};

// Applied before hydration so the correct theme paints on the first frame
// instead of flashing dark (the default) and then switching to light.
const NO_FLASH_THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('plexo-theme');
    var theme = stored || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    if (theme === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <DensityProvider>
            <QueryProvider>{children}</QueryProvider>
          </DensityProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
