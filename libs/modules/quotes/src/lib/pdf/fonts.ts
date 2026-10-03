import { createRequire } from 'node:module';
import { join } from 'node:path';
import { Font } from '@react-pdf/renderer';

/** Tipografías de las 5 plantillas, desde los paquetes @fontsource (archivos
 * .woff dentro de node_modules: no dependen de internet al generar el PDF).
 * Se resuelven desde la raíz del proyecto (process.cwd(), igual que
 * `uploads/`) porque esta librería se compila a ESM y la API la empaqueta.
 * Los paquetes @fontsource están en el package.json raíz y no en el de esta
 * librería: se cargan por ruta, y el chequeo de dependencias de Nx no los
 * vería usados. */
const resolveFromRoot = createRequire(join(process.cwd(), 'package.json')).resolve;

function file(pkg: string, name: string): string {
  return resolveFromRoot(`@fontsource/${pkg}/files/${name}.woff`);
}

export const FONTS = {
  sans: 'Geist',
  mono: 'GeistMono',
  serif: 'SourceSerif',
  display: 'Fraunces',
  rounded: 'NunitoSans',
  legible: 'Atkinson',
} as const;

let registered = false;

export function registerPdfFonts(): void {
  if (registered) return;
  registered = true;

  Font.register({
    family: FONTS.sans,
    fonts: [
      { src: file('geist', 'geist-latin-400-normal'), fontWeight: 400 },
      { src: file('geist', 'geist-latin-500-normal'), fontWeight: 500 },
      { src: file('geist', 'geist-latin-600-normal'), fontWeight: 600 },
      { src: file('geist', 'geist-latin-700-normal'), fontWeight: 700 },
    ],
  });
  Font.register({
    family: FONTS.mono,
    fonts: [
      { src: file('geist-mono', 'geist-mono-latin-400-normal'), fontWeight: 400 },
      { src: file('geist-mono', 'geist-mono-latin-600-normal'), fontWeight: 600 },
    ],
  });
  Font.register({
    family: FONTS.serif,
    fonts: [
      { src: file('source-serif-4', 'source-serif-4-latin-400-normal'), fontWeight: 400 },
      { src: file('source-serif-4', 'source-serif-4-latin-400-italic'), fontWeight: 400, fontStyle: 'italic' },
      { src: file('source-serif-4', 'source-serif-4-latin-600-normal'), fontWeight: 600 },
      { src: file('source-serif-4', 'source-serif-4-latin-700-normal'), fontWeight: 700 },
    ],
  });
  Font.register({
    family: FONTS.display,
    fonts: [
      { src: file('fraunces', 'fraunces-latin-500-normal'), fontWeight: 500 },
      { src: file('fraunces', 'fraunces-latin-600-normal'), fontWeight: 600 },
    ],
  });
  Font.register({
    family: FONTS.rounded,
    fonts: [
      { src: file('nunito-sans', 'nunito-sans-latin-400-normal'), fontWeight: 400 },
      { src: file('nunito-sans', 'nunito-sans-latin-600-normal'), fontWeight: 600 },
      { src: file('nunito-sans', 'nunito-sans-latin-700-normal'), fontWeight: 700 },
    ],
  });
  Font.register({
    family: FONTS.legible,
    fonts: [
      { src: file('atkinson-hyperlegible', 'atkinson-hyperlegible-latin-400-normal'), fontWeight: 400 },
      { src: file('atkinson-hyperlegible', 'atkinson-hyperlegible-latin-700-normal'), fontWeight: 700 },
    ],
  });

  // Sin guiones de corte: códigos como "MESA-TRABAJO-600X1200" se partían en
  // "MESA-TRA-/BA-/JO..." - mejor pasar la palabra entera al renglón siguiente.
  Font.registerHyphenationCallback((word) => [word]);
}
