// Copia de la de @plexo/quotes (build-pdf-data.ts): un módulo no importa
// internos de otro.

const CURRENCY_WORDS: Record<string, string> = {
  ARS: 'pesos',
  USD: 'dólares estadounidenses',
  EUR: 'euros',
};

/** "Son pesos ..." - el importe en letras. */
export function amountInWords(amount: number, currencyCode: string): string {
  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100);
  const currency = CURRENCY_WORDS[currencyCode] ?? currencyCode;
  return `${currency} ${integerInWords(whole)} con ${String(cents).padStart(2, '0')}/100`;
}

const UNITS = [
  '', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece',
  'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós',
  'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos',
  'ochocientos', 'novecientos',
];

function belowHundred(n: number): string {
  return n < 30 ? UNITS[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ` y ${UNITS[n % 10]}` : '');
}

function belowThousand(n: number): string {
  if (n === 100) return 'cien';
  const hundreds = HUNDREDS[Math.floor(n / 100)];
  const rest = n % 100 ? belowHundred(n % 100) : '';
  return [hundreds, rest].filter(Boolean).join(' ');
}

/** "uno" pasa a "un" delante de "mil"/"millones" ("veintiún mil"). */
function apocope(words: string): string {
  return words.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');
}

function integerInWords(n: number): string {
  if (n === 0) return 'cero';
  const parts: string[] = [];
  // Hasta 999.999 millones: "mil quinientos millones" sale de la recursión.
  const millions = Math.floor(n / 1e6);
  const thousands = Math.floor((n % 1e6) / 1e3);
  const rest = n % 1e3;
  if (millions) parts.push(millions === 1 ? 'un millón' : `${apocope(integerInWords(millions))} millones`);
  if (thousands) parts.push(thousands === 1 ? 'mil' : `${apocope(belowThousand(thousands))} mil`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(' ');
}
