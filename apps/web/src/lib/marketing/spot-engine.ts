// Motor de dibujo del spot publicitario de 6 s (Admin › Marketing › Videos).
// Porte fiel de docs/referencia/oplex-spot.html: mismas escenas, tiempos,
// textos y colores - si cambia el diseño del video, cambia allá primero.
// TypeScript puro, sin React ni DOM más allá del CanvasRenderingContext2D
// que recibe, así lo puede usar la pantalla de vista previa o un render
// automático.

export const SPOT_DURATION = 6;

export type SpotFormat = '9x16' | '1x1' | '16x9';
export type SpotScene = 'circuito' | 'whatsapp' | 'factura' | 'excel' | 'mp' | 'produccion' | 'qr';

export interface SpotConfig {
  format: SpotFormat;
  /** La última palabra sale en naranja. */
  hook: string;
  scene: SpotScene;
  sceneTitle: string;
  cta: string;
  site: string;
  /** Familia CSS de Poppins (la que arma next/font); sin ella, cae a Helvetica/Arial. */
  fontFamily?: string;
}

export const SPOT_FORMATS: Record<SpotFormat, readonly [number, number]> = {
  '9x16': [1080, 1920],
  '1x1': [1080, 1080],
  '16x9': [1920, 1080],
};

export const SPOT_SCENE_TITLES: Record<SpotScene, string> = {
  circuito: 'Cargás una vez. Oplex hace el resto.',
  whatsapp: 'Tu negocio te responde por WhatsApp.',
  factura: 'Sacale una foto a la factura.',
  excel: 'Subí tu Excel. La IA lo ordena.',
  mp: 'Cobrás con Mercado Pago. Se registra solo.',
  produccion: 'Producción con recetas y stock.',
  qr: 'Cobrá con QR desde la caja.',
};

export const SPOT_DEFAULTS: SpotConfig = {
  format: '9x16',
  hook: '¿Seguís pasando datos a mano?',
  scene: 'circuito',
  sceneTitle: SPOT_SCENE_TITLES.circuito,
  cta: 'Probalo 15 días gratis',
  site: 'oplex.com.ar',
};

/** Etapas del spot en tiempo real (segundos), para la barra de la vista previa. */
export const SPOT_BEATS = [
  { label: 'Gancho', from: 0, to: 1.8 },
  { label: 'Producto', from: 1.8, to: 4.2 },
  { label: 'Marca', from: 4.2, to: 6 },
] as const;

// tiempo real (6 s) → línea de tiempo de animación (5 s), con pausas para leer
const WARP: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1.2, 1.2],
  [1.6, 1.2],
  [3.5, 3.1],
  [4.1, 3.1],
  [6, 5],
];

export function warp(r: number): number {
  for (let i = 1; i < WARP.length; i++) {
    const [b, d] = WARP[i];
    if (r <= b) {
      const [a, c] = WARP[i - 1];
      return c + ((d - c) * (r - a)) / (b - a);
    }
  }
  return 5;
}

const NAVY = '#13213F';
const NAVY2 = '#1C2E57';
const ORANGE = '#E8692F';
const WHITE = '#FFFFFF';
const INK = '#13213F';
const GRAY = '#6B7590';
const CHAT = '#EEF1F7';

const BODY_H: Record<SpotScene, number> = { circuito: 572, whatsapp: 540, factura: 572, excel: 540, mp: 540, produccion: 566, qr: 525 };
const nf = new Intl.NumberFormat('es-AR');

/** Lo que comparten todas las funciones de dibujo de un cuadro. */
interface Paint {
  ctx: CanvasRenderingContext2D;
  cfg: SpotConfig;
  font: (weight: number, size: number) => string;
}

// ---------- helpers ----------
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const p = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const eOut = (x: number) => 1 - Math.pow(1 - x, 3);
const eInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eBack = (x: number) => {
  if (x <= 0) return 0;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if ('roundRect' in ctx) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  r = Math.min(r, w / 2, h / 2);
  const c = ctx as CanvasRenderingContext2D;
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function check(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.28;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.42, cy + r * 0.02);
  ctx.lineTo(cx - r * 0.1, cy + r * 0.34);
  ctx.lineTo(cx + r * 0.46, cy - r * 0.3);
  ctx.stroke();
}

/** Isotipo de Oplex: arco abierto + punto naranja. */
function drawMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, sweep: number, dot: number, color: string) {
  const a0 = (-15 * Math.PI) / 180;
  const a1 = (276 * Math.PI) / 180;
  if (sweep > 0) {
    ctx.strokeStyle = color;
    ctx.lineWidth = R * 0.48;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a0 + (a1 - a0) * sweep);
    ctx.stroke();
  }
  if (dot > 0) {
    const ang = (-52.7 * Math.PI) / 180;
    const d = R * 1.14;
    ctx.fillStyle = ORANGE;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, R * 0.27 * dot, 0, Math.PI * 2);
    ctx.fill();
  }
}

function tick(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, d: number) {
  if (d > 0) {
    ctx.save();
    ctx.globalAlpha *= d;
    ctx.fillStyle = ORANGE;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    check(ctx, cx, cy, r, WHITE);
    ctx.restore();
  } else {
    ctx.strokeStyle = '#C9CFDC';
    ctx.lineWidth = r * 0.18;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function pill({ ctx, font }: Paint, cx: number, y: number, text: string, u: number, a: number) {
  if (a <= 0) return;
  ctx.font = font(600, 28 * u);
  const bw = ctx.measureText(text).width + 70 * u;
  const bh = 72 * u;
  ctx.save();
  ctx.translate(cx, y + bh / 2);
  ctx.scale(a, a);
  ctx.fillStyle = ORANGE;
  rr(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
  ctx.fill();
  ctx.fillStyle = WHITE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 2 * u);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

function hline(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, u: number) {
  ctx.strokeStyle = '#E3E7F0';
  ctx.lineWidth = 2 * u;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
}

// ---------- cuadro ----------

/**
 * Dibuja el cuadro del instante `tReal` (0 a 6 s) en el canvas de `ctx`.
 * El canvas tiene que tener ya el tamaño de SPOT_FORMATS[config.format].
 */
export function drawFrame(ctx: CanvasRenderingContext2D, tReal: number, config: SpotConfig): void {
  const family = config.fontFamily ? `${config.fontFamily}, ` : 'Poppins, ';
  const paint: Paint = {
    ctx,
    cfg: config,
    font: (w, size) => `${w} ${size}px ${family}"Helvetica Neue", Arial, sans-serif`,
  };
  const t = warp(tReal);
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const s = Math.min(W, H) / 1080;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W * 0.88, H * 0.08, 0, W * 0.88, H * 0.08, Math.max(W, H) * 0.62);
  g.addColorStop(0, 'rgba(232,105,47,0.22)');
  g.addColorStop(1, 'rgba(232,105,47,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 70 * s;
  ctx.lineCap = 'round';
  const rot = t * 0.22;
  ctx.beginPath();
  ctx.arc(W * 0.1, H * 0.94, Math.max(W, H) * 0.4, rot, rot + Math.PI * 1.55);
  ctx.stroke();
  ctx.restore();

  lockup(paint, t, W, H, s);
  sceneHook(paint, t, W, H, s);
  sceneProduct(paint, t, W, H, s);
  sceneBrand(paint, t, W, H, s);
}

function lockup({ ctx, font }: Paint, t: number, W: number, H: number, s: number) {
  const a = eOut(p(t, 0, 0.3)) * (1 - p(t, 3.1, 3.3));
  if (a <= 0) return;
  const vert = H > W;
  const R = 17 * s;
  const fs = 38 * s;
  ctx.font = font(700, fs);
  const tw = ctx.measureText('Oplex').width;
  const gap = 22 * s;
  const total = R * 2.4 + gap + tw;
  const x0 = W / 2 - total / 2;
  const cy = (vert ? 150 : 86) * s;
  ctx.save();
  ctx.globalAlpha = a * 0.92;
  drawMark(ctx, x0 + R * 1.2, cy, R, 1, 1, WHITE);
  ctx.fillStyle = WHITE;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Oplex', x0 + R * 2.4 + gap, cy + 2 * s);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
}

function sceneHook({ ctx, cfg, font }: Paint, t: number, W: number, H: number, s: number) {
  if (t > 1.65) return;
  const out = eInOut(p(t, 1.28, 1.6));
  const vert = H > W;
  const size = (vert ? 116 : 100) * s;
  ctx.font = font(700, size);
  const lines = wrap(ctx, cfg.hook, W * (vert ? 0.84 : W > H ? 0.62 : 0.82));
  const lh = size * 1.12;
  const y0 = H / 2 - (lines.length * lh) / 2 - out * 110 * s;
  const totalWords = lines.reduce((n, l) => n + l.split(' ').length, 0);
  let wi = 0;
  ctx.textAlign = 'left';
  lines.forEach((line, li) => {
    const words = line.split(' ');
    let x = W / 2 - ctx.measureText(line).width / 2;
    const y = y0 + li * lh + size * 0.9;
    words.forEach((w) => {
      const st = 0.08 + wi * 0.08;
      const a = eOut(p(t, st, st + 0.32));
      ctx.globalAlpha = a * (1 - out);
      ctx.fillStyle = wi === totalWords - 1 ? ORANGE : WHITE;
      ctx.fillText(w, x, y + (1 - a) * 46 * s);
      x += ctx.measureText(`${w} `).width;
      wi++;
    });
  });
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
}

function sceneProduct(paint: Paint, t: number, W: number, H: number, s: number) {
  const { ctx, cfg, font } = paint;
  if (t < 1.4 || t > 3.45) return;
  const a = eOut(p(t, 1.42, 1.75));
  const o = eInOut(p(t, 3.12, 3.42));
  const alpha = a * (1 - o);
  if (alpha <= 0) return;
  const vert = H > W;
  const k = vert ? 1 : 0.86;
  const u = s * k;
  const cw = vert ? W * 0.84 : Math.min(W * 0.8, 900 * s);
  const hs = (vert ? 76 : 62) * s;
  ctx.font = font(700, hs);
  const lines = wrap(ctx, cfg.sceneTitle, cw);
  const lh = hs * 1.14;
  const headH = lines.length * lh;
  const gap = 50 * u;
  const total = headH + gap + BODY_H[cfg.scene] * u;
  const top = (H - total) / 2 + (vert ? 30 * s : 20 * s) + (1 - a) * 50 * s - o * 60 * s;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = WHITE;
  ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * lh + hs * 0.92));
  const by = top + headH + gap;
  (BODIES[cfg.scene] ?? bodyCircuito)(paint, t, W / 2, by, cw, u);
  ctx.globalAlpha = alpha * 0.45;
  ctx.fillStyle = WHITE;
  ctx.font = font(500, 22 * s);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Datos de ejemplo', W / 2, H - (vert ? 70 : 38) * s);
  ctx.restore();
}

type Body = (paint: Paint, t: number, cx: number, y: number, cw: number, u: number) => void;

const bodyCircuito: Body = ({ ctx, font }, t, cx, y, cw, u) => {
  const steps = [
    ['Vendés en la caja', '$ 9.840', 'Caja 1'],
    ['ARCA autoriza', 'Factura B con CAE', '0,9 s'],
    ['Stock actualizado', 'Yerba 1 kg: 46 u.', '-2 u.'],
    ['Contabilidad', 'Asiento N.º 1.284', 'automático'],
  ];
  const ch = 128 * u;
  const g = 20 * u;
  const x = cx - cw / 2;
  const lx = x + 64 * u;
  const lp = eInOut(p(t, 1.8, 2.75));
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 4 * u;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(lx, y + ch / 2);
  ctx.lineTo(lx, y + ch / 2 + 3 * (ch + g) * lp);
  ctx.stroke();
  steps.forEach((st, i) => {
    const t0 = 1.68 + i * 0.28;
    const a = eOut(p(t, t0, t0 + 0.32));
    if (a <= 0) return;
    const cy = y + i * (ch + g);
    const dx = (1 - a) * 90 * u;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.fillStyle = WHITE;
    rr(ctx, x + dx, cy, cw, ch, 26 * u);
    ctx.fill();
    const done = p(t, t0 + 0.22, t0 + 0.38);
    const bump = 1 + 0.18 * Math.sin(Math.PI * done);
    const ccx = x + dx + 64 * u;
    const ccy = cy + ch / 2;
    const r = 32 * u * bump;
    ctx.fillStyle = done > 0 ? ORANGE : NAVY;
    ctx.beginPath();
    ctx.arc(ccx, ccy, r, 0, Math.PI * 2);
    ctx.fill();
    if (done > 0) check(ctx, ccx, ccy, 32 * u, WHITE);
    else {
      ctx.fillStyle = WHITE;
      ctx.font = font(700, 28 * u);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), ccx, ccy + 2 * u);
    }
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = GRAY;
    ctx.font = font(600, 25 * u);
    ctx.fillText(st[0], x + dx + 122 * u, cy + 52 * u);
    ctx.fillStyle = INK;
    ctx.font = font(700, 38 * u);
    ctx.fillText(st[1], x + dx + 122 * u, cy + 98 * u);
    ctx.textAlign = 'right';
    ctx.fillStyle = done > 0 ? ORANGE : GRAY;
    ctx.font = font(600, 24 * u);
    ctx.fillText(st[2], x + dx + cw - 34 * u, cy + ch / 2 + 9 * u);
    ctx.restore();
  });
  ctx.textAlign = 'center';
};

const bodyWhats: Body = ({ ctx, font }, t, cx, y, cw, u) => {
  const x = cx - cw / 2;
  const ph = 540 * u;
  const hh = 104 * u;
  ctx.save();
  rr(ctx, x, y, cw, ph, 34 * u);
  ctx.clip();
  ctx.fillStyle = CHAT;
  ctx.fillRect(x, y, cw, ph);
  ctx.fillStyle = NAVY2;
  ctx.fillRect(x, y, cw, hh);
  ctx.fillStyle = NAVY;
  ctx.beginPath();
  ctx.arc(x + 62 * u, y + hh / 2, 32 * u, 0, Math.PI * 2);
  ctx.fill();
  drawMark(ctx, x + 60 * u, y + hh / 2 + 2 * u, 13 * u, 1, 1, WHITE);
  ctx.textAlign = 'left';
  ctx.fillStyle = WHITE;
  ctx.font = font(700, 30 * u);
  ctx.fillText('Oplex', x + 112 * u, y + 48 * u);
  ctx.globalAlpha *= 0.7;
  ctx.font = font(500, 22 * u);
  ctx.fillText('asistente de tu empresa', x + 112 * u, y + 80 * u);
  ctx.globalAlpha /= 0.7;

  // burbuja del usuario
  const ua = eBack(p(t, 1.72, 2.0));
  if (ua > 0) {
    const q = '¿Cuánto facturé hoy?';
    ctx.font = font(500, 32 * u);
    const bw = ctx.measureText(q).width + 56 * u;
    const bh = 78 * u;
    const bx = x + cw - 28 * u - bw;
    const byy = y + 136 * u;
    ctx.save();
    ctx.translate(bx + bw, byy + bh);
    ctx.scale(ua, ua);
    ctx.translate(-(bx + bw), -(byy + bh));
    ctx.fillStyle = '#D8F5CC';
    rr(ctx, bx, byy, bw, bh, 22 * u);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(q, bx + 28 * u, byy + bh / 2 + 2 * u);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }
  const ry = y + 240 * u;
  const rx = x + 28 * u;
  // "escribiendo..."
  if (t > 2.0 && t < 2.44) {
    ctx.fillStyle = WHITE;
    rr(ctx, rx, ry, 120 * u, 64 * u, 22 * u);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const b = Math.sin(t * 12 - i * 0.9);
      ctx.fillStyle = GRAY;
      ctx.beginPath();
      ctx.arc(rx + 34 * u + i * 26 * u, ry + 32 * u - Math.max(0, b) * 7 * u, 8 * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // respuesta
  const ra = eBack(p(t, 2.42, 2.7));
  if (ra > 0) {
    const bw = cw - 120 * u;
    const bh = 226 * u;
    ctx.save();
    ctx.translate(rx, ry + bh);
    ctx.scale(ra, ra);
    ctx.translate(-rx, -(ry + bh));
    ctx.fillStyle = WHITE;
    rr(ctx, rx, ry, bw, bh, 22 * u);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = GRAY;
    ctx.font = font(500, 28 * u);
    ctx.fillText('Hoy facturaste', rx + 32 * u, ry + 56 * u);
    const n = 412600 * eOut(p(t, 2.5, 3.0));
    ctx.fillStyle = ORANGE;
    ctx.font = font(700, 66 * u);
    ctx.fillText(`$ ${nf.format(Math.round(n / 100) * 100)}`, rx + 30 * u, ry + 132 * u);
    ctx.fillStyle = INK;
    ctx.font = font(500, 26 * u);
    ctx.fillText('en 38 ventas · 12 % más que el martes', rx + 32 * u, ry + 186 * u);
    ctx.restore();
  }
  ctx.restore();
  ctx.textAlign = 'center';
};

const bodyFactura: Body = ({ ctx, font }, t, cx, y, cw, u) => {
  const fw = Math.min(cw, 780 * u);
  const x = cx - fw / 2;
  const h = 470 * u;
  ctx.save();
  ctx.fillStyle = WHITE;
  rr(ctx, x, y, fw, h, 22 * u);
  ctx.fill();
  ctx.save();
  rr(ctx, x, y, fw, h, 22 * u);
  ctx.clip();
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = font(700, 32 * u);
  ctx.fillText('FACTURA A', x + 40 * u, y + 62 * u);
  ctx.textAlign = 'right';
  ctx.fillStyle = GRAY;
  ctx.font = font(500, 24 * u);
  ctx.fillText('0003-00018842', x + fw - 40 * u, y + 62 * u);
  ctx.strokeStyle = '#DCE1EC';
  ctx.lineWidth = 2 * u;
  ctx.setLineDash([8 * u, 8 * u]);
  ctx.beginPath();
  ctx.moveTo(x + 40 * u, y + 96 * u);
  ctx.lineTo(x + fw - 40 * u, y + 96 * u);
  ctx.stroke();
  ctx.setLineDash([]);
  const rows = [
    ['Proveedor', 'Molinos del Sur SA'],
    ['CUIT', '30-71456203-9'],
    ['Neto gravado', '$ 184.300'],
    ['IVA 21 %', '$ 38.703'],
    ['Total', '$ 223.003'],
  ];
  const sp = eInOut(p(t, 1.8, 2.72));
  const scanY = y + 100 * u + sp * (h - 110 * u);
  rows.forEach((r, i) => {
    const last = i === rows.length - 1;
    const rowY = y + 150 * u + i * 66 * u + (last ? 14 * u : 0);
    const read = clamp((scanY - rowY + 10 * u) / (30 * u));
    if (last) {
      ctx.strokeStyle = '#DCE1EC';
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.moveTo(x + 40 * u, rowY - 38 * u);
      ctx.lineTo(x + fw - 40 * u, rowY - 38 * u);
      ctx.stroke();
    }
    if (read > 0) {
      ctx.fillStyle = `rgba(232,105,47,${0.09 * read})`;
      ctx.fillRect(x + 22 * u, rowY - 38 * u, fw - 44 * u, 54 * u);
      ctx.save();
      ctx.globalAlpha *= read;
      ctx.fillStyle = ORANGE;
      ctx.beginPath();
      ctx.arc(x + 54 * u, rowY - 11 * u, 13 * u, 0, Math.PI * 2);
      ctx.fill();
      check(ctx, x + 54 * u, rowY - 11 * u, 13 * u, WHITE);
      ctx.restore();
    } else {
      ctx.strokeStyle = '#C9CFDC';
      ctx.lineWidth = 2.5 * u;
      ctx.beginPath();
      ctx.arc(x + 54 * u, rowY - 11 * u, 12 * u, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = GRAY;
    ctx.font = font(last ? 600 : 500, (last ? 28 : 25) * u);
    ctx.fillText(r[0], x + 84 * u, rowY);
    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    ctx.font = font(last ? 700 : 600, (last ? 34 : 27) * u);
    ctx.fillText(r[1], x + fw - 40 * u, rowY);
  });
  if (sp > 0 && sp < 1) {
    const gr = ctx.createLinearGradient(0, scanY - 90 * u, 0, scanY);
    gr.addColorStop(0, 'rgba(232,105,47,0)');
    gr.addColorStop(1, 'rgba(232,105,47,0.28)');
    ctx.fillStyle = gr;
    ctx.fillRect(x, scanY - 90 * u, fw, 90 * u);
    ctx.fillStyle = ORANGE;
    ctx.fillRect(x, scanY - 2 * u, fw, 5 * u);
  }
  ctx.restore();
  const ba = eBack(p(t, 2.74, 3.0));
  if (ba > 0) {
    const txt = 'Leída con IA · confianza 0,94';
    ctx.font = font(600, 28 * u);
    const bw = ctx.measureText(txt).width + 70 * u;
    const bh = 72 * u;
    const byy = y + h + 30 * u;
    ctx.save();
    ctx.translate(cx, byy + bh / 2);
    ctx.scale(ba, ba);
    ctx.fillStyle = ORANGE;
    rr(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, 0, 2 * u);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
  ctx.textAlign = 'center';
};

const bodyExcel: Body = (paint, t, cx, y, cw, u) => {
  const { ctx, font } = paint;
  const fw = Math.min(cw, 840 * u);
  const x = cx - fw / 2;
  const hh = 74 * u;
  const rh = 58 * u;
  const h = hh + rh * 6 + 16 * u;
  ctx.fillStyle = WHITE;
  rr(ctx, x, y, fw, h, 22 * u);
  ctx.fill();
  ctx.save();
  rr(ctx, x, y, fw, h, 22 * u);
  ctx.clip();
  ctx.fillStyle = '#1F7A4D';
  ctx.fillRect(x, y, fw, hh);
  ctx.textAlign = 'left';
  ctx.fillStyle = WHITE;
  ctx.font = font(600, 28 * u);
  ctx.fillText('articulos.xlsx', x + 36 * u, y + hh / 2 + 10 * u);
  ctx.textAlign = 'right';
  ctx.font = font(500, 22 * u);
  ctx.fillText('1.248 filas', x + fw - 36 * u, y + hh / 2 + 8 * u);
  const y0 = y + hh;
  const colX = [x + 0.05 * fw, x + 0.25 * fw, x + 0.84 * fw];
  const align: CanvasTextAlign[] = ['left', 'left', 'right'];
  ctx.fillStyle = '#EEF1F7';
  ctx.fillRect(x, y0, fw, rh);
  const raw = ['COD', 'DESCRIP', 'P.VTA'];
  const mapped = ['Código', 'Artículo', 'Precio'];
  raw.forEach((r, i) => {
    const m = eOut(p(t, 1.75 + i * 0.15, 2.0 + i * 0.15));
    ctx.textAlign = align[i];
    ctx.save();
    ctx.globalAlpha *= 1 - m;
    ctx.fillStyle = GRAY;
    ctx.font = font(600, 22 * u);
    ctx.fillText(r, colX[i], y0 + rh / 2 + 8 * u);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha *= m;
    ctx.fillStyle = ORANGE;
    ctx.font = font(700, 24 * u);
    ctx.fillText(mapped[i], colX[i], y0 + rh / 2 + 9 * u);
    ctx.restore();
  });
  const rows = [
    ['A-0001', 'Yerba 1 kg', '$ 3.690'],
    ['A-0002', 'Azúcar 1 kg', '$ 2.460'],
    ['A-0003', 'Aceite girasol 1,5 l', '$ 4.150'],
    ['A-0004', 'Fideos guiseros 500 g', '$ 1.380'],
    ['A-0005', 'Harina 000 1 kg', '$ 1.290'],
  ];
  rows.forEach((r, i) => {
    const ry = y0 + rh * (i + 1);
    const read = p(t, 2.2 + i * 0.1, 2.32 + i * 0.1);
    if (read > 0) {
      ctx.fillStyle = `rgba(232,105,47,${0.08 * read})`;
      ctx.fillRect(x, ry, fw, rh);
    }
    hline(ctx, x, x + fw, ry, u);
    const by = ry + rh / 2 + 9 * u;
    ctx.textAlign = 'left';
    ctx.fillStyle = GRAY;
    ctx.font = font(500, 22 * u);
    ctx.fillText(r[0], colX[0], by);
    ctx.fillStyle = INK;
    ctx.font = font(600, 25 * u);
    ctx.fillText(r[1], colX[1], by);
    ctx.textAlign = 'right';
    ctx.fillText(r[2], colX[2], by);
    tick(ctx, x + 0.93 * fw, ry + rh / 2, 15 * u, read);
  });
  ctx.restore();
  const n = Math.round(1248 * eOut(p(t, 2.72, 3.02)));
  pill(paint, cx, y + h + 30 * u, `${nf.format(n)} artículos importados`, u, eBack(p(t, 2.7, 2.95)));
  ctx.textAlign = 'center';
};

const bodyMP: Body = ({ ctx, font }, t, cx, y, cw, u) => {
  const fw = Math.min(cw, 840 * u);
  const x = cx - fw / 2;
  const nh = 132 * u;
  const na = eBack(p(t, 1.66, 1.98));
  if (na > 0) {
    ctx.save();
    ctx.globalAlpha *= clamp(na);
    ctx.translate(0, (1 - na) * -60 * u);
    ctx.fillStyle = WHITE;
    rr(ctx, x, y, fw, nh, 28 * u);
    ctx.fill();
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.arc(x + 70 * u, y + nh / 2, 38 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = WHITE;
    ctx.font = font(700, 40 * u);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', x + 70 * u, y + nh / 2 + 2 * u);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = GRAY;
    ctx.font = font(600, 24 * u);
    ctx.fillText('Mercado Pago · ahora', x + 130 * u, y + 54 * u);
    const n = 23500 * eOut(p(t, 1.8, 2.2));
    ctx.fillStyle = INK;
    ctx.font = font(700, 38 * u);
    ctx.fillText(`Recibiste $ ${nf.format(Math.round(n / 100) * 100)}`, x + 130 * u, y + 100 * u);
    ctx.restore();
  }
  const cy0 = y + nh;
  const gap = 44 * u;
  const lp = eInOut(p(t, 2.0, 2.2));
  if (lp > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 4 * u;
    ctx.setLineDash([10 * u, 10 * u]);
    ctx.beginPath();
    ctx.moveTo(cx, cy0 + 6 * u);
    ctx.lineTo(cx, cy0 + 6 * u + (gap - 12 * u) * lp);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const ky = cy0 + gap;
  const kh = 70 * u + 3 * 92 * u + 12 * u;
  const ka = eOut(p(t, 2.05, 2.3));
  if (ka > 0) {
    ctx.save();
    ctx.globalAlpha *= ka;
    ctx.fillStyle = WHITE;
    rr(ctx, x, ky, fw, kh, 26 * u);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = GRAY;
    ctx.font = font(600, 22 * u);
    ctx.fillText('EN OPLEX, SIN CARGAR NADA', x + 36 * u, ky + 48 * u);
    const rows = [
      ['Cobro registrado en Caja 1', '$ 23.500'],
      ['Factura B emitida con CAE', '0001-00004822'],
      ['Cuenta conciliada', 'Mercado Pago'],
    ];
    rows.forEach((r, i) => {
      const ry = ky + 70 * u + i * 92 * u;
      const d = p(t, 2.3 + i * 0.22, 2.45 + i * 0.22);
      if (i > 0) hline(ctx, x + 36 * u, x + fw - 36 * u, ry, u);
      tick(ctx, x + 58 * u, ry + 46 * u, 22 * u, d);
      ctx.textAlign = 'left';
      ctx.fillStyle = INK;
      ctx.font = font(600, 29 * u);
      ctx.fillText(r[0], x + 100 * u, ry + 56 * u);
      ctx.textAlign = 'right';
      ctx.fillStyle = d > 0 ? ORANGE : GRAY;
      ctx.font = font(600, 24 * u);
      ctx.fillText(r[1], x + fw - 36 * u, ry + 56 * u);
    });
    ctx.restore();
  }
  ctx.textAlign = 'center';
};

const bodyProd: Body = (paint, t, cx, y, cw, u) => {
  const { ctx, font } = paint;
  const fw = Math.min(cw, 840 * u);
  const x = cx - fw / 2;
  const hh = 116 * u;
  const rh = 82 * u;
  const h = hh + 4 * rh + 18 * u;
  ctx.fillStyle = WHITE;
  rr(ctx, x, y, fw, h, 24 * u);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = ORANGE;
  ctx.font = font(700, 24 * u);
  ctx.fillText('ORDEN OP-0042', x + 40 * u, y + 50 * u);
  ctx.fillStyle = INK;
  ctx.font = font(700, 36 * u);
  ctx.fillText('Mesa ratona roble · 3 u.', x + 40 * u, y + 94 * u);
  ctx.textAlign = 'right';
  ctx.fillStyle = GRAY;
  ctx.font = font(600, 22 * u);
  ctx.fillText('Receta', x + fw - 40 * u, y + 50 * u);
  const items = [
    ['Tabla roble 2 m', '6 u.'],
    ['Tornillo 6×40', '48 u.'],
    ['Laca poliuretánica', '1,5 l'],
    ['Patas de hierro', '12 u.'],
  ];
  items.forEach((it, i) => {
    const ry = y + hh + i * rh;
    const f = eInOut(p(t, 1.85 + i * 0.2, 2.2 + i * 0.2));
    const done = p(t, 2.15 + i * 0.2, 2.3 + i * 0.2);
    hline(ctx, x + 40 * u, x + fw - 40 * u, ry, u);
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    ctx.font = font(600, 27 * u);
    ctx.fillText(it[0], x + 40 * u, ry + 40 * u);
    ctx.textAlign = 'right';
    ctx.fillStyle = GRAY;
    ctx.font = font(600, 25 * u);
    ctx.fillText(it[1], x + fw - 96 * u, ry + 40 * u);
    const bx = x + 40 * u;
    const bw = fw - 176 * u;
    const byy = ry + 56 * u;
    ctx.fillStyle = '#E6EAF2';
    rr(ctx, bx, byy, bw, 10 * u, 5 * u);
    ctx.fill();
    if (f > 0) {
      ctx.fillStyle = ORANGE;
      rr(ctx, bx, byy, Math.max(10 * u, bw * f), 10 * u, 5 * u);
      ctx.fill();
    }
    tick(ctx, x + fw - 56 * u, ry + rh / 2, 20 * u, done);
  });
  pill(paint, cx, y + h + 30 * u, 'Insumos reservados para 3 mesas', u, eBack(p(t, 2.78, 3.02)));
  ctx.textAlign = 'center';
};

/** QR decorativo (25×25, semilla fija): no codifica nada, sólo se ve como un QR. */
const QR_SIZE = 25;
const QR: boolean[][] = (() => {
  const n = QR_SIZE;
  const m: boolean[][] = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let r = 0; r < n; r++) {
    m[r] = [];
    for (let c = 0; c < n; c++) m[r][c] = rnd() > 0.52;
  }
  const finder = (r0: number, c0: number) => {
    for (let r = -1; r < 8; r++)
      for (let c = -1; c < 8; c++) {
        const R = r0 + r;
        const C = c0 + c;
        if (R < 0 || C < 0 || R >= n || C >= n) continue;
        const inF = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        m[R][C] = inF && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      }
  };
  finder(0, 0);
  finder(0, n - 7);
  finder(n - 7, 0);
  return m;
})();

const bodyQR: Body = (paint, t, cx, y, cw, u) => {
  const { ctx, font } = paint;
  const fw = Math.min(cw, 860 * u);
  const x = cx - fw / 2;
  const h = 420 * u;
  const lw = fw * 0.5;
  ctx.fillStyle = WHITE;
  rr(ctx, x, y, fw, h, 24 * u);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = GRAY;
  ctx.font = font(600, 22 * u);
  ctx.fillText('CAJA 1 · SUCURSAL CENTRO', x + 40 * u, y + 58 * u);
  [
    ['2 × Yerba 1 kg', '7.380'],
    ['1 × Azúcar 1 kg', '2.460'],
  ].forEach((it, i) => {
    const a = eOut(p(t, 1.66 + i * 0.14, 1.9 + i * 0.14));
    const ry = y + 120 * u + i * 56 * u;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.fillStyle = INK;
    ctx.font = font(500, 26 * u);
    ctx.textAlign = 'left';
    ctx.fillText(it[0], x + 40 * u, ry);
    ctx.textAlign = 'right';
    ctx.fillText(it[1], x + lw, ry);
    ctx.restore();
  });
  ctx.strokeStyle = '#DCE1EC';
  ctx.lineWidth = 2 * u;
  ctx.setLineDash([8 * u, 8 * u]);
  ctx.beginPath();
  ctx.moveTo(x + 40 * u, y + 200 * u);
  ctx.lineTo(x + lw, y + 200 * u);
  ctx.stroke();
  ctx.setLineDash([]);
  const ta = eOut(p(t, 1.95, 2.2));
  ctx.save();
  ctx.globalAlpha *= ta;
  ctx.textAlign = 'left';
  ctx.fillStyle = GRAY;
  ctx.font = font(600, 22 * u);
  ctx.fillText('TOTAL', x + 40 * u, y + 250 * u);
  ctx.fillStyle = INK;
  ctx.font = font(700, 56 * u);
  ctx.fillText('$ 9.840', x + 40 * u, y + 316 * u);
  ctx.restore();
  const ca = p(t, 2.75, 2.92);
  if (ca > 0) {
    tick(ctx, x + 56 * u, y + 366 * u, 16 * u, ca);
    ctx.save();
    ctx.globalAlpha *= ca;
    ctx.textAlign = 'left';
    ctx.fillStyle = ORANGE;
    ctx.font = font(600, 24 * u);
    ctx.fillText('Factura B con CAE', x + 84 * u, y + 375 * u);
    ctx.restore();
  }
  const qs = 300 * u;
  const qx = x + fw - 40 * u - qs;
  const qy = y + (h - qs) / 2;
  const qa = eBack(p(t, 1.9, 2.2));
  if (qa > 0) {
    ctx.save();
    ctx.translate(qx + qs / 2, qy + qs / 2);
    ctx.scale(qa, qa);
    ctx.translate(-(qx + qs / 2), -(qy + qs / 2));
    const cell = qs / QR_SIZE;
    ctx.fillStyle = NAVY;
    for (let r = 0; r < QR_SIZE; r++)
      for (let c = 0; c < QR_SIZE; c++) if (QR[r][c]) ctx.fillRect(qx + c * cell, qy + r * cell, cell + 0.5, cell + 0.5);
    ctx.restore();
  }
  const sl = p(t, 2.2, 2.5);
  if (sl > 0 && sl < 1) {
    ctx.fillStyle = ORANGE;
    ctx.fillRect(qx - 10 * u, qy + qs * eInOut(sl) - 2 * u, qs + 20 * u, 5 * u);
  }
  const ap = eBack(p(t, 2.5, 2.75));
  if (ap > 0) {
    ctx.save();
    ctx.globalAlpha *= clamp(ap) * 0.93;
    ctx.fillStyle = WHITE;
    ctx.fillRect(qx - 4 * u, qy - 4 * u, qs + 8 * u, qs + 8 * u);
    ctx.restore();
    const ccy = qy + qs / 2 - 24 * u;
    ctx.fillStyle = ORANGE;
    ctx.beginPath();
    ctx.arc(qx + qs / 2, ccy, 70 * u * ap, 0, Math.PI * 2);
    ctx.fill();
    check(ctx, qx + qs / 2, ccy, 70 * u * ap, WHITE);
    ctx.save();
    ctx.globalAlpha *= clamp(ap);
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = font(700, 30 * u);
    ctx.fillText('Pago aprobado', qx + qs / 2, ccy + 118 * u);
    ctx.restore();
  }
  pill(paint, cx, y + h + 30 * u, 'Cobro con QR y factura emitida', u, eBack(p(t, 2.8, 3.04)));
  ctx.textAlign = 'center';
};

const BODIES: Record<SpotScene, Body> = {
  circuito: bodyCircuito,
  whatsapp: bodyWhats,
  factura: bodyFactura,
  excel: bodyExcel,
  mp: bodyMP,
  produccion: bodyProd,
  qr: bodyQR,
};

function sceneBrand({ ctx, cfg, font }: Paint, t: number, W: number, H: number, s: number) {
  if (t < 3.3) return;
  const vert = H > W;
  const u = s * (vert ? 1 : 0.8);
  const R = 128 * u;
  const word = 160 * u;
  const ctaH = 94 * u;
  const ctaF = 38 * u;
  const urlF = 34 * u;
  const total = R * 2.3 + 44 * u + word * 0.78 + 70 * u + ctaH + 44 * u + urlF * 0.8;
  const top = (H - total) / 2;
  const mcy = top + R * 1.15;
  drawMark(ctx, W / 2, mcy, R, eInOut(p(t, 3.36, 3.95)), eBack(p(t, 3.82, 4.12)), WHITE);
  const wa = eOut(p(t, 3.95, 4.3));
  const wy = mcy + R * 1.15 + 44 * u + word * 0.78 + (1 - wa) * 34 * u;
  ctx.globalAlpha = wa;
  ctx.fillStyle = WHITE;
  ctx.textAlign = 'center';
  ctx.font = font(700, word);
  ctx.fillText('Oplex', W / 2, wy);
  const ca = eBack(p(t, 4.16, 4.48));
  const caA = p(t, 4.16, 4.32);
  if (caA > 0) {
    ctx.font = font(600, ctaF);
    const cwid = ctx.measureText(cfg.cta).width + 100 * u;
    const cy = wy + 70 * u;
    ctx.save();
    ctx.globalAlpha = caA;
    ctx.translate(W / 2, cy + ctaH / 2);
    const sc = 0.82 + 0.18 * ca;
    ctx.scale(sc, sc);
    ctx.fillStyle = ORANGE;
    rr(ctx, -cwid / 2, -ctaH / 2, cwid, ctaH, ctaH / 2);
    ctx.fill();
    ctx.fillStyle = WHITE;
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.cta, 0, 2 * u);
    ctx.restore();
    const ua = eOut(p(t, 4.34, 4.6));
    ctx.globalAlpha = ua * 0.82;
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(500, urlF);
    ctx.fillStyle = WHITE;
    ctx.fillText(cfg.site, W / 2, cy + ctaH + 44 * u + urlF * 0.8);
  }
  ctx.globalAlpha = 1;
}
