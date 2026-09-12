import './globals.css';
import { DensityProvider } from '@/providers/DensityProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata = {
  title: 'OPLEX',
  description: 'OPLEX — ERP SaaS',
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
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
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
