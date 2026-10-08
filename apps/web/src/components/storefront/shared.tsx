'use client';

import { API_BASE_URL } from '@/lib/api';
import {
  sendStorefrontOrder,
  type StorefrontOrderResult,
  type StorefrontPayload,
  type StorefrontProduct,
  type StorefrontStore,
  type StorefrontVariant,
} from '@/lib/storefront';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Piezas que comparten las 8 plantillas de la tienda: el contexto que
 * reciben (catálogo + pedido + capas), galerías, opciones y el pedido.
 * Replican el "motor" del boceto v2 (gal, snapGal, opts, cartHTML).
 */

export type Cart = Record<string, number>;
export type LayerKind = 'pv' | 'cart' | 'menu';

export interface StoreCtx {
  store: StorefrontStore;
  products: StorefrontProduct[];
  // Primero los nuevos y los que tienen más fotos: los que lucen la portada.
  featured: StorefrontProduct[];
  categories: string[];
  taxCondition: StorefrontPayload['taxCondition'];
  preview: boolean;
  reduce: boolean;
  cover: string;
  cart: Cart;
  count: number;
  total: number;
  screen: HTMLDivElement | null;
  hud: HTMLDivElement | null;
  /** Agrega al pedido. Sin variante y con varias opciones (talle/color), abre la ficha para elegir. */
  add: (p: StorefrontProduct, variantId?: string, qty?: number, el?: HTMLElement | null) => void;
  setQty: (variantId: string, qty: number) => void;
  qtyOf: (p: StorefrontProduct) => number;
  open: (productId: string) => void;
  openCart: () => void;
  openMenu: () => void;
  close: () => void;
  layerOpen: boolean;
  // Vitrina: qué pantalla se ve (la usan la página, el índice y el teclado).
  slide: number;
  setSlide: (i: number) => void;
}

export interface TemplateModule {
  Page: (props: { ctx: StoreCtx }) => ReactNode;
  View: (props: { ctx: StoreCtx; p: StorefrontProduct }) => ReactNode;
  Menu?: (props: { ctx: StoreCtx }) => ReactNode;
  // La página se maneja sola (Vitrina): sin scroll y con teclado propio.
  locked?: boolean;
}

/** Baja (o sube) hasta una parte de la página, dentro de la pantalla de la tienda. */
export function scrollTo(ctx: StoreCtx, selector: string, block: ScrollLogicalPosition = 'start') {
  ctx.screen?.querySelector(selector)?.scrollIntoView({ block, behavior: ctx.reduce ? 'auto' : 'smooth' });
}

export function uploadUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${API_BASE_URL.replace(/\/api\/?$/, '')}${path}`;
}

/** Artículo sin fotos: un recuadro neutro con la inicial, como imagen (así le
 * aplican los mismos estilos que a una foto en cada plantilla). */
function placeholder(name: string): string {
  const letter = (name.trim()[0] ?? '?').toUpperCase().replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#d9d8d3"/><text x="200" y="238" font-family="Georgia,serif" font-size="140" fill="#9b9a94" text-anchor="middle">${letter}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function photo(p: StorefrontProduct, i = 0): string {
  const path = p.images[i] ?? p.images[0];
  return path ? uploadUrl(path) : placeholder(p.name);
}

export function photos(p: StorefrontProduct): string[] {
  return p.images.length > 0 ? p.images.map((path) => uploadUrl(path)) : [placeholder(p.name)];
}

export function money(n: number): string {
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

/** "Quedan 3" / "Última unidad" cuando la tienda muestra el stock y es poco. */
export function lowLabel(shown: number | null | undefined): string {
  if (shown == null || shown > 5) return '';
  return shown === 1 ? 'Última unidad' : `Quedan ${shown}`;
}

export function priceNote(ctx: StoreCtx): string {
  return ctx.taxCondition === 'RESPONSABLE_INSCRIPTO' ? 'Precio final con IVA' : 'Precio final';
}

export function pricesNote(ctx: StoreCtx): string {
  return ctx.taxCondition === 'RESPONSABLE_INSCRIPTO' ? 'Precios finales con IVA' : 'Precios finales';
}

/** La ley pide el precio sin impuestos nacionales cuando se discrimina IVA. */
export function netNote(ctx: StoreCtx, v: StorefrontVariant | undefined): string {
  if (ctx.taxCondition !== 'RESPONSABLE_INSCRIPTO' || v?.netPrice == null) return '';
  return `Precio sin impuestos nacionales: ${money(v.netPrice)}`;
}

export function fromPrice(p: StorefrontProduct): string {
  return p.variants.length > 1 && p.variants.some((v) => v.price !== p.price) ? `Desde ${money(p.price)}` : money(p.price);
}

export function inCat(ctx: StoreCtx, c: string): StorefrontProduct[] {
  return ctx.featured.filter((p) => p.category === c);
}

export function catImage(ctx: StoreCtx, c: string): string {
  const first = inCat(ctx, c)[0];
  return first ? photo(first) : ctx.cover;
}

/** Temporada del hemisferio sur, para los rótulos de las portadas. */
export function season(d = new Date()): string {
  const m = d.getMonth();
  return m <= 1 || m === 11 ? 'verano' : m <= 4 ? 'otoño' : m <= 7 ? 'invierno' : 'primavera';
}

export const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Tamaño de un nombre en letra gigante según su largo (cabezal, pie). */
export function fitSize(text: string, perChar: number, max: number): string {
  const len = Math.max(3, text.length);
  return `min(${max}cqi, ${(perChar / len).toFixed(2)}cqi)`;
}

/** Variante elegida en la ficha (talle/color); arranca en la primera. */
export function useVariant(p: StorefrontProduct) {
  const [id, setId] = useState(p.variants[0]?.id);
  const variant = p.variants.find((v) => v.id === id) ?? p.variants[0];
  return [variant, setId] as const;
}

export function Options({ p, value, onChange, cls = 'opt' }: { p: StorefrontProduct; value: StorefrontVariant | undefined; onChange: (id: string) => void; cls?: string }) {
  if (p.variants.length < 2) return null;
  return (
    <div className="optw">
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
        Opción: <b style={{ opacity: 1 }}>{value?.label}</b>
      </div>
      <div className={cls} role="group" aria-label="Opciones">
        {p.variants.map((v) => (
          <button key={v.id} aria-pressed={v.id === value?.id} onClick={() => onChange(v.id)}>
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Ficha: lo que en el boceto eran "especificaciones" sale de lo que tiene el artículo. */
export function specRows(p: StorefrontProduct, v: StorefrontVariant | undefined): [string, string][] {
  const rows: [string, string][] = [['Categoría', p.category]];
  if (p.variants.length > 1) rows.push(['Opciones', p.variants.map((x) => x.label).join(' · ')]);
  if (p.sku) rows.push(['Código', p.sku]);
  const low = lowLabel(v?.stockShown ?? p.stockShown);
  rows.push(['Stock', low || ((v?.stockShown ?? p.stockShown) != null ? `${v?.stockShown ?? p.stockShown} unidades` : 'Disponible')]);
  return rows;
}

export function SpecsDl({ p, v }: { p: StorefrontProduct; v: StorefrontVariant | undefined }) {
  return (
    <dl>
      {specRows(p, v).map(([k, val]) => (
        <Fragment key={k}>
          <dt>{k}</dt>
          <dd>{val}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** Galería con flechas, deslizar, contador, miniaturas y teclado. */
export function Gallery({ p, stageStyle }: { p: StorefrontProduct; stageStyle?: React.CSSProperties }) {
  const imgs = photos(p);
  const [i, setI] = useState(0);
  const x0 = useRef<number | null>(null);
  const many = imgs.length > 1;
  const go = (n: number) => setI((n + imgs.length) % imgs.length);
  useEffect(() => {
    if (!many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((n) => (n + 1) % imgs.length);
      if (e.key === 'ArrowLeft') setI((n) => (n - 1 + imgs.length) % imgs.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [many, imgs.length]);
  return (
    <div className="g">
      <div
        className="g-stage"
        style={stageStyle}
        onPointerDown={(e) => {
          x0.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (x0.current === null) return;
          const dx = e.clientX - x0.current;
          x0.current = null;
          if (many && Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
        }}
      >
        {imgs.map((src, k) => (
          <figure key={k} className={`g-s${k === i ? ' on' : ''}`}>
            <img src={src} alt={`${p.name}, foto ${k + 1}`} draggable={false} />
          </figure>
        ))}
        {many && (
          <>
            <button className="g-nav g-prev" onClick={() => go(i - 1)} aria-label="Foto anterior">
              ‹
            </button>
            <button className="g-nav g-next" onClick={() => go(i + 1)} aria-label="Foto siguiente">
              ›
            </button>
            <span className="g-count">
              {i + 1} / {imgs.length}
            </span>
          </>
        )}
      </div>
      {many && (
        <div className="g-thumbs">
          {imgs.map((src, k) => (
            <button key={k} className={`g-t${k === i ? ' on' : ''}`} onClick={() => go(k)} aria-label={`Foto ${k + 1}`}>
              <img src={src} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Fotos que se deslizan de costado con puntitos (Pop, Mercado). */
export function SnapGallery({ p }: { p: StorefrontProduct }) {
  const imgs = photos(p);
  const [i, setI] = useState(0);
  return (
    <>
      <div className="snap" onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
        {imgs.map((src, k) => (
          <img key={k} src={src} alt={`${p.name}, foto ${k + 1}`} />
        ))}
      </div>
      {imgs.length > 1 && (
        <div className="dots">
          {imgs.map((_, k) => (
            <i key={k} className={k === i ? 'on' : ''} />
          ))}
        </div>
      )}
    </>
  );
}

/** Tira de fotos que se arrastra con el mouse (Atelier). */
export function DragStrip({ p }: { p: StorefrontProduct }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; s: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      ref={ref}
      className={`strip${dragging ? ' drag' : ''}`}
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse' || !ref.current) return;
        drag.current = { x: e.clientX, s: ref.current.scrollLeft };
        setDragging(true);
        ref.current.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current && ref.current) ref.current.scrollLeft = drag.current.s - (e.clientX - drag.current.x);
      }}
      onPointerUp={() => {
        drag.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
      }}
    >
      {photos(p).map((src, k) => (
        <img key={k} src={src} alt={`${p.name}, foto ${k + 1}`} draggable={false} />
      ))}
    </div>
  );
}

/** Lo que haya que portar al hud (burbuja, barra, cursor) - sólo en el navegador. */
export { createPortal } from 'react-dom';

const CART_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 7h12l-1 13H7L6 7z" />
    <path d="M9 7a3 3 0 0 1 6 0" />
  </svg>
);
export const CartIcon = () => CART_ICON;

/** Línea del pedido con su artículo y variante. */
export interface CartLine {
  id: string;
  qty: number;
  product: StorefrontProduct;
  variant: StorefrontVariant;
}

export function cartLines(cart: Cart, products: StorefrontProduct[]): CartLine[] {
  const lines: CartLine[] = [];
  for (const product of products) {
    for (const variant of product.variants) {
      const qty = cart[variant.id];
      if (qty > 0) lines.push({ id: variant.id, qty, product, variant });
    }
  }
  return lines;
}

/** El texto que le llega a la tienda (igual al que arma la API). Sólo para la vista previa. */
function previewMessage(store: StorefrontStore, lines: CartLine[], total: number, name: string, phone: string, note: string): string {
  return [
    `Hola ${store.name}! Quiero hacer este pedido:`,
    ...lines.map((l) => `• ${l.qty} × ${l.product.name}${l.product.variants.length > 1 ? ` (${l.variant.label})` : ''} — ${money(l.variant.price * l.qty)}`),
    `Total: ${money(total)}`,
    '',
    `Nombre: ${name}`,
    ...(phone ? [`Teléfono: ${phone}`] : []),
    ...(note ? [`Nota: ${note}`] : []),
  ].join('\n');
}

/** El pedido: cada plantilla lo viste distinto con .L-<plantilla> .cart (ver storefront.css). */
export function CartPanel({ ctx, onCleared }: { ctx: StoreCtx; onCleared: () => void }) {
  const { store } = ctx;
  const lines = cartLines(ctx.cart, ctx.products);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<StorefrontOrderResult | null>(null);

  async function submit() {
    setError('');
    if (name.trim().length < 2) {
      setError('Escribí tu nombre para que sepan quién hace el pedido');
      return;
    }
    if (ctx.preview) {
      setResult({ number: 0, message: previewMessage(store, lines, ctx.total, name.trim(), phone.trim(), note.trim()), whatsappUrl: null });
      return;
    }
    setSending(true);
    try {
      const res = await sendStorefrontOrder(store.subdomain, {
        customerName: name.trim(),
        customerPhone: phone.trim() || undefined,
        note: note.trim() || undefined,
        lines: lines.map((l) => ({ variantId: l.id, quantity: l.qty })),
      });
      setResult(res);
      onCleared();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  let body: ReactNode;
  if (result) {
    body = ctx.preview ? (
      <>
        <div className="cap">Vista previa · así le llegaría el pedido a {store.name}</div>
        <div className="msg">{result.message}</div>
        <p className="nt" style={{ marginTop: 12 }}>
          En la tienda publicada se guarda en Pedidos de la tienda y se abre WhatsApp con este mensaje ya escrito.
        </p>
      </>
    ) : (
      <>
        <div className="cap">Pedido #{result.number} recibido</div>
        {result.whatsappUrl ? (
          <>
            <p className="nt" style={{ textAlign: 'left', marginTop: 8 }}>
              Falta un paso: mandá este mensaje por WhatsApp para que {store.name} te confirme stock, envío y forma de pago.
            </p>
            <div className="msg">{result.message}</div>
            <a className="send" href={result.whatsappUrl} target="_blank" rel="noopener noreferrer" style={{ marginTop: 12 }}>
              Abrir WhatsApp y enviar
            </a>
          </>
        ) : (
          <p className="nt" style={{ textAlign: 'left', marginTop: 8 }}>
            {store.name} ya lo recibió y se va a comunicar con vos para confirmar stock, envío y forma de pago.
          </p>
        )}
      </>
    );
  } else if (lines.length === 0) {
    body = (
      <div className="empty">
        Tu pedido está vacío.
        <br />
        Agregá lo que te guste y lo mandás{store.whatsappNumber ? ' por WhatsApp' : ''}.
      </div>
    );
  } else {
    body = lines.map(({ id, qty, product, variant }) => {
      const max = variant.stockShown ?? 99;
      return (
        <div className="it" key={id}>
          <div className="im">
            <img src={photo(product)} alt="" />
          </div>
          <div>
            <b>{product.name}</b>
            <small>
              {product.variants.length > 1 ? `${variant.label} · ` : ''}
              {money(variant.price)} c/u
            </small>
            {qty >= max && variant.stockShown != null && <small className="stockw"> · {lowLabel(max) || `Hay ${max}`}</small>}
          </div>
          <div className="qq">
            <button onClick={() => ctx.setQty(id, qty - 1)} aria-label="Menos">
              −
            </button>
            <span>{qty}</span>
            <button onClick={() => ctx.setQty(id, Math.min(max, qty + 1))} aria-label="Más" disabled={qty >= max}>
              +
            </button>
          </div>
        </div>
      );
    });
  }

  return (
    <aside className="cart" aria-label="Mi pedido">
      <div className="hd">
        <h3>{result ? '¡Listo!' : 'Mi pedido'}</h3>
        <button onClick={ctx.close} aria-label="Cerrar" style={{ fontSize: 20 }}>
          ×
        </button>
      </div>
      <div className="ls">
        {body}
        {result && (
          <button className="again" onClick={() => (ctx.preview ? setResult(null) : ctx.close())}>
            {ctx.preview ? 'Volver al pedido' : 'Seguir mirando'}
          </button>
        )}
      </div>
      {!result && lines.length > 0 && (
        <div className="ft">
          <div className="tot">
            <span>Total</span>
            <span>{money(ctx.total)}</span>
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" aria-label="Tu nombre" maxLength={80} autoComplete="name" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Tu teléfono (opcional)" aria-label="Tu teléfono" maxLength={30} inputMode="tel" autoComplete="tel" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="¿Envío o retiro? ¿Algún detalle?" aria-label="Nota" maxLength={500} />
          {error && <span className="err">{error}</span>}
          <button className="send" onClick={submit} disabled={sending}>
            {sending ? 'Enviando…' : store.whatsappNumber ? 'Enviar pedido por WhatsApp' : 'Enviar pedido'}
          </button>
          <span className="nt">No se cobra nada ahora. {store.name} te confirma stock, envío y forma de pago.</span>
        </div>
      )}
    </aside>
  );
}
