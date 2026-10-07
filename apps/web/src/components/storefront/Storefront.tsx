'use client';

import { API_BASE_URL } from '@/lib/api';
import {
  sendStorefrontOrder,
  storefrontFontsHref,
  type StorefrontOrderResult,
  type StorefrontPayload,
  type StorefrontProduct,
  type StorefrontStore,
  type StorefrontTemplate,
  type StorefrontVariant,
} from '@/lib/storefront';
import { useEffect, useMemo, useRef, useState } from 'react';
import './storefront.css';

/**
 * La tienda online pública (y su vista previa dentro de Oplex). Replica el
 * boceto aprobado: 8 plantillas que cambian todo vía [data-t] en
 * storefront.css, ficha con galería (flechas, deslizar, miniaturas, lupa) y
 * pedido que se manda por WhatsApp (etapa A: no se cobra nada).
 */

type GalleryMode = 'fade' | 'slide' | 'bounce' | 'cut' | 'vertical' | 'flip';

const TEMPLATE_COPY: Record<StorefrontTemplate, { eyebrow?: string; title: string; sub: string; cta: string; mode: GalleryMode }> = {
  aire: { title: 'Elegí lo que te guste y armá tu pedido.', sub: 'Stock y precios al día. Mandás el pedido y te respondemos por WhatsApp.', cta: 'Ver catálogo', mode: 'fade' },
  atelier: { eyebrow: 'Colección', title: 'Hecho con cuidado, pensado para durar', sub: 'Elegí tus piezas y armá el pedido; te confirmamos todo por WhatsApp.', cta: 'Descubrir la colección', mode: 'slide' },
  pop: { eyebrow: '¡Llegó lo nuevo!', title: 'Lo que buscás, con más onda', sub: 'Precios claros y stock real. Armá tu pedido en dos toques y te lo confirmamos por WhatsApp.', cta: '¡Quiero ver todo!', mode: 'bounce' },
  taller: { eyebrow: '// Catálogo actualizado con el stock real', title: 'Stock real. Precio claro.', sub: 'Cada artículo con su código y su stock. Pedí y te confirmamos disponibilidad al instante.', cta: 'Ver lista completa', mode: 'cut' },
  mercado: { eyebrow: 'Recién llegado', title: 'Lo bueno, cerca tuyo', sub: 'Elegí sin apuro, armá tu pedido y coordinamos la entrega por WhatsApp.', cta: 'Recorrer el catálogo', mode: 'fade' },
  neon: { eyebrow: 'Nueva temporada', title: 'Lo nuevo ya llegó', sub: 'Stock en tiempo real. Armá tu pedido y te respondemos al toque.', cta: 'Explorar', mode: 'slide' },
  revista: { eyebrow: 'Esta edición', title: 'Lo nuevo, en una sola edición', sub: 'Una selección para recorrer con calma. Lo que te guste, lo sumás al pedido.', cta: 'Leer la edición', mode: 'vertical' },
  vitrina: { title: 'Selección exclusiva', sub: 'Piezas elegidas una por una, en pocas unidades.', cta: 'Ver la selección', mode: 'flip' },
};

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function uploadUrl(path: string): string {
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${API_BASE_URL.replace(/\/api\/?$/, '')}${path}`;
}

function money(n: number): string {
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function stockLabel(shown: number | null): string | null {
  if (shown == null) return null;
  return shown === 1 ? 'Última unidad' : `Quedan ${shown}`;
}

function waLink(number: string | null, text: string): string | null {
  const digits = (number ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

/** Un título del usuario partido en dos renglones (Atelier). */
function splitInTwo(text: string): string[] {
  const words = text.split(/\s+/);
  if (words.length < 2) return [text];
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(' '), words.slice(half).join(' ')];
}

/** La última palabra resaltada (Pop, Revista). */
function emphasizeLast(text: string): React.ReactNode {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return text;
  return (
    <>
      {words.slice(0, -1).join(' ')} <em>{words[words.length - 1]}</em>
    </>
  );
}

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduce(mq.matches);
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduce;
}

type Cart = Record<string, number>;

/** El pedido en armado queda guardado en este navegador, por tienda. Al
 * cargar se descartan variantes que ya no están en el catálogo. */
function useCart(subdomain: string, products: StorefrontProduct[], preview: boolean): [Cart, React.Dispatch<React.SetStateAction<Cart>>] {
  const key = `oplex.tienda.${subdomain}${preview ? '.preview' : ''}`;
  const [cart, setCart] = useState<Cart>({});
  const loaded = useRef(false);
  useEffect(() => {
    const valid = new Set(products.flatMap((p) => p.variants.map((v) => v.id)));
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as Cart;
      setCart(Object.fromEntries(Object.entries(saved).filter(([id, q]) => valid.has(id) && q > 0)));
    } catch {
      // Sin acceso a localStorage: el pedido arranca vacío.
    }
    loaded.current = true;
  }, [key, products]);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(key, JSON.stringify(cart));
    } catch {
      // Ignorado a propósito: recordar el pedido es sólo una comodidad.
    }
  }, [key, cart]);
  return [cart, setCart];
}

function confetti(btn: HTMLElement) {
  const colors = ['#ff4f2e', '#2b59ff', '#ffd400', '#161616', '#19c37d'];
  for (let i = 0; i < 16; i++) {
    const s = document.createElement('span');
    s.className = 'conf';
    s.style.background = colors[i % colors.length];
    const a = Math.random() * Math.PI * 2;
    const d = 40 + Math.random() * 50;
    s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    s.style.setProperty('--dy', `${Math.sin(a) * d - 20}px`);
    btn.appendChild(s);
    window.setTimeout(() => s.remove(), 850);
  }
}

function Photo({ src, alt, className }: { src: string | undefined; alt: string; className?: string }) {
  if (!src) {
    return (
      <span
        className={className}
        aria-label={alt}
        style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(127,127,127,.12)', color: 'rgba(127,127,127,.7)', fontSize: 40 }}
      >
        {alt.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return <img src={uploadUrl(src)} alt={alt} className={className} loading="lazy" draggable={false} />;
}

interface Props {
  data: StorefrontPayload;
  // Vista previa dentro de Oplex: todo funciona, pero el pedido no se envía.
  preview?: boolean;
}

export default function Storefront({ data, preview = false }: Props) {
  const { store, products, categories, taxCondition } = data;
  const t = store.template;
  const copy = TEMPLATE_COPY[t] ?? TEMPLATE_COPY.aire;
  const title = store.heroTitle || copy.title;
  const sub = store.heroSubtitle || copy.sub;
  const reduceMotion = useReducedMotion();

  const [cat, setCat] = useState('Todo');
  const [openId, setOpenId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useCart(store.subdomain, products, preview);
  const [bump, setBump] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  const variantIndex = useMemo(() => {
    const map = new Map<string, { product: StorefrontProduct; variant: StorefrontVariant }>();
    for (const product of products) for (const variant of product.variants) map.set(variant.id, { product, variant });
    return map;
  }, [products]);

  const visibleCat = cat === 'Todo' || categories.includes(cat) ? cat : 'Todo';
  const list = visibleCat === 'Todo' ? products : products.filter((p) => p.category === visibleCat);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const open = openId ? (products.find((p) => p.id === openId) ?? null) : null;

  const style = useMemo(() => {
    const s: Record<string, string> = {};
    if (store.accentColor) {
      s['--acc'] = store.accentColor;
      s['--acc-ink'] = '#fff';
    }
    return s as React.CSSProperties;
  }, [store.accentColor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpenId(null);
      setCartOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function add(variantId: string, qty: number, btn?: HTMLElement | null) {
    setCart((prev) => ({ ...prev, [variantId]: Math.min(99, (prev[variantId] ?? 0) + qty) }));
    setBump((b) => b + 1);
    if (btn && t === 'pop' && !reduceMotion) confetti(btn);
  }

  const scrollToGrid = () => gridRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  const firstImage = products.find((p) => p.images[0])?.images[0];
  const now = new Date();

  return (
    <>
      <link rel="stylesheet" href={storefrontFontsHref(t)} precedence="default" />
      <div className="st st-page" data-t={t} style={style}>
        {t === 'taller' && <div className="extra haz" />}
        {t === 'neon' && <div className="extra floor" />}
        {t === 'mercado' && (
          <div className="extra blobs">
            <i />
            <i />
            <i />
          </div>
        )}

        <header className="st-head">
          <div className="st-logo">
            {store.logoUrl ? (
              <img src={uploadUrl(store.logoUrl)} alt={store.name} style={{ height: 40, width: 'auto', objectFit: 'contain', display: 'block' }} />
            ) : (
              store.name
            )}
          </div>
          <nav className="st-nav">
            {categories.slice(0, 4).map((c) => (
              <a
                key={c}
                href="#catalogo"
                onClick={(e) => {
                  e.preventDefault();
                  setCat(c);
                  scrollToGrid();
                }}
              >
                {c}
              </a>
            ))}
          </nav>
          <button key={bump} className={`cartbtn${bump ? ' bump' : ''}`} onClick={() => setCartOpen(true)} aria-label="Ver mi pedido">
            Mi pedido <span className="n">{count}</span>
          </button>
        </header>

        {t === 'vitrina' && products.length >= 3 && <Ring products={products} />}

        <section className="st-hero">
          {t === 'revista' && (
            <div className="issue">
              {String(now.getMonth() + 1).padStart(2, '0')}
              <small>
                {MONTHS[now.getMonth()]} {now.getFullYear()}
              </small>
            </div>
          )}
          <div>
            <div className="eyebrow">{copy.eyebrow ?? (t === 'aire' ? categories.slice(0, 3).join(' · ') : store.name)}</div>
            <h1>
              {t === 'taller' ? (
                <Typewriter text={title} reduceMotion={reduceMotion} />
              ) : t === 'atelier' ? (
                splitInTwo(title).map((line, i) => (
                  <span className="ln" key={i}>
                    <span>{line}</span>
                  </span>
                ))
              ) : t === 'pop' || t === 'revista' ? (
                emphasizeLast(title)
              ) : (
                title
              )}
            </h1>
            <p>{sub}</p>
            <button className="cta" onClick={scrollToGrid}>
              {copy.cta} →
            </button>
          </div>
          <div className="hero-art">
            <Photo src={firstImage} alt={store.name} />
            {t === 'pop' && (
              <span className="stk">
                ¡Nuevo
                <br />
                ingreso!
              </span>
            )}
          </div>
        </section>

        {(t === 'pop' || t === 'atelier') && categories.length > 0 && <Marquee words={categories} sep={t === 'pop' ? '  ✦  ' : '  ·  '} />}
        {t === 'mercado' && (
          <div className="extra wave">
            <svg viewBox="0 0 1600 34" preserveAspectRatio="none" aria-hidden>
              <path d="M0 17 Q100 0 200 17 T400 17 T600 17 T800 17 T1000 17 T1200 17 T1400 17 T1600 17 V34 H0Z" fill="#e0a52640" />
            </svg>
          </div>
        )}

        <div className="st-cats" role="group" aria-label="Categorías" id="catalogo">
          {['Todo', ...categories].map((c) => (
            <button key={c} className="chip" aria-pressed={c === visibleCat} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>

        <div className="st-grid" ref={gridRef}>
          {list.map((p, i) => (
            <ProductCard
              key={p.id}
              product={p}
              index={i}
              template={t}
              reduceMotion={reduceMotion}
              onOpen={() => setOpenId(p.id)}
              onAdd={(btn) => {
                // Con varias variantes (talle/color) hay que elegir: se abre la ficha.
                if (p.variants.length > 1) setOpenId(p.id);
                else add(p.variants[0].id, 1, btn);
              }}
            />
          ))}
          {list.length === 0 && (
            <p style={{ gridColumn: '1 / -1', color: 'var(--muted)', padding: '30px 0' }}>
              {products.length === 0 ? 'Todavía no hay artículos publicados.' : 'No hay artículos en esta categoría.'}
            </p>
          )}
        </div>

        {t === 'revista' && products.length > 1 && (
          <div className="extra rail">
            <h4>Más para ver</h4>
            <div className="tr">
              {[...products].reverse().map((p) => (
                <button
                  key={p.id}
                  className="it"
                  onClick={() => setOpenId(p.id)}
                  style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', color: 'inherit', font: 'inherit' }}
                >
                  <div style={{ position: 'relative' }}>
                    <Photo src={p.images[0]} alt={p.name} />
                  </div>
                  <b>{p.name}</b>
                  <span>{money(p.price)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <footer className="st-foot">
          <span>
            <b>{store.name}</b>
            {store.address ? ` · ${store.address}` : ''}
            {store.whatsappNumber ? ' · Pedidos por WhatsApp' : ''}
          </span>
          <span>{taxCondition === 'RESPONSABLE_INSCRIPTO' ? 'Precios finales con IVA incluido' : 'Precios finales'} · Hecho con Oplex</span>
        </footer>
      </div>

      <div className={`ov${open ? ' open' : ''}`} aria-hidden={!open} onClick={(e) => e.target === e.currentTarget && setOpenId(null)}>
        {open && (
          <div className="st st-layer" data-t={t} style={style} onClick={(e) => e.target === e.currentTarget && setOpenId(null)}>
            <ProductDialog
              key={open.id}
              product={open}
              mode={copy.mode}
              taxCondition={taxCondition}
              store={store}
              onClose={() => setOpenId(null)}
              onAdd={(variantId, qty, btn) => add(variantId, qty, btn)}
            />
          </div>
        )}
      </div>

      <div className={`ov cart${cartOpen ? ' open' : ''}`} aria-hidden={!cartOpen} onClick={(e) => e.target === e.currentTarget && setCartOpen(false)}>
        <div className="st st-layer" data-t={t} style={style} onClick={(e) => e.target === e.currentTarget && setCartOpen(false)}>
          <CartDrawer
            store={store}
            preview={preview}
            cart={cart}
            variantIndex={variantIndex}
            onChange={(variantId, qty) =>
              setCart((prev) => {
                const next = { ...prev };
                if (qty <= 0) delete next[variantId];
                else next[variantId] = Math.min(99, qty);
                return next;
              })
            }
            onClear={() => setCart({})}
            onClose={() => setCartOpen(false)}
          />
        </div>
      </div>
    </>
  );
}

function ProductCard({
  product: p,
  index,
  template: t,
  reduceMotion,
  onOpen,
  onAdd,
}: {
  product: StorefrontProduct;
  index: number;
  template: StorefrontTemplate;
  reduceMotion: boolean;
  onOpen: () => void;
  onAdd: (btn: HTMLButtonElement) => void;
}) {
  const [added, setAdded] = useState(false);
  const stock = stockLabel(p.stockShown);
  const fromPrice = p.variants.length > 1 && p.variants.some((v) => v.price !== p.price) ? 'Desde ' : '';

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    if (t === 'neon') {
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    } else if (t === 'vitrina' && !reduceMotion) {
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `rotateY(${x * 12}deg) rotateX(${-y * 10}deg) translateZ(10px)`;
    }
  }
  function onPointerLeave(e: React.PointerEvent<HTMLElement>) {
    if (t === 'vitrina') e.currentTarget.style.transform = '';
  }
  function handleAdd(e: React.MouseEvent<HTMLButtonElement>) {
    onAdd(e.currentTarget);
    if (p.variants.length > 1) return;
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  }

  const addButton = (
    <button className="add" onClick={handleAdd}>
      {added ? (t === 'taller' ? '✓ AGREGADO' : 'Agregado ✓') : t === 'taller' ? '+ Agregar' : p.variants.length > 1 ? 'Elegir' : 'Agregar'}
    </button>
  );

  return (
    <article className="card" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <button className="ph" onClick={onOpen} aria-label={`Ver ${p.name}`}>
        <Photo src={p.images[0]} alt={p.name} />
        {p.images[1] && <Photo src={p.images[1]} alt={p.name} className="alt" />}
        {stock && p.stockShown != null && p.stockShown <= 5 && <span className="badge">{stock}</span>}
        {p.images.length > 1 && (
          <span className="dots">
            {p.images.slice(0, 6).map((_, i) => (
              <i key={i} />
            ))}
          </span>
        )}
      </button>
      <div className="info">
        <span className="num">{String(index + 1).padStart(2, '0')}</span>
        <span className="cat">{p.category}</span>
        <h3 className="nm">{p.name}</h3>
        <span className="code">{p.sku}</span>
        {t !== 'taller' && (
          <div className="row">
            <span className="price">
              {fromPrice}
              {money(p.price)}
            </span>
            {addButton}
          </div>
        )}
      </div>
      {t === 'taller' && (
        <div className="rt">
          {p.stockShown != null && (
            <span className="stockline">
              STOCK <b>{String(p.stockShown).padStart(2, '0')}</b>
            </span>
          )}
          <span className="price">
            {fromPrice}
            {money(p.price)}
          </span>
          {addButton}
        </div>
      )}
    </article>
  );
}

function ProductDialog({
  product: p,
  mode,
  taxCondition,
  store,
  onClose,
  onAdd,
}: {
  product: StorefrontProduct;
  mode: GalleryMode;
  taxCondition: StorefrontPayload['taxCondition'];
  store: StorefrontStore;
  onClose: () => void;
  onAdd: (variantId: string, qty: number, btn: HTMLButtonElement) => void;
}) {
  const images = p.images.length > 0 ? p.images : [''];
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [cutKey, setCutKey] = useState(0);
  const [variantId, setVariantId] = useState(p.variants[0]?.id);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const variant = p.variants.find((v) => v.id === variantId) ?? p.variants[0];
  const many = images.length > 1;

  function go(next: number) {
    setIndex((next + images.length) % images.length);
    setZoom(false);
    setCutKey((k) => k + 1);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const stock = stockLabel(variant?.stockShown ?? null);
  const ask = waLink(store.whatsappNumber, `Hola ${store.name}! Quería consultar por: ${p.name}${p.variants.length > 1 && variant ? ` (${variant.label})` : ''} (${money(variant?.price ?? p.price)}).`);

  return (
    <div className="pd" role="dialog" aria-modal="true" aria-label={p.name}>
      <button className="x" onClick={onClose} aria-label="Cerrar">
        ×
      </button>
      <div className="gal" data-mode={mode} key={mode === 'cut' ? cutKey : undefined}>
        <div
          className={`stage${zoom ? ' zoom' : ''}`}
          ref={stageRef}
          onPointerDown={(e) => {
            startX.current = e.clientX;
          }}
          onPointerUp={(e) => {
            if (startX.current === null) return;
            const dx = e.clientX - startX.current;
            startX.current = null;
            if (many && Math.abs(dx) > 40) go(dx < 0 ? index + 1 : index - 1);
            else if (!(e.target as HTMLElement).closest('.nav')) setZoom((z) => !z);
          }}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const img = e.currentTarget.querySelector<HTMLElement>('.slide.on img');
            if (img) img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
          }}
          onPointerLeave={() => setZoom(false)}
        >
          {images.map((src, i) => (
            <div key={i} className={`slide${i === index ? ' on' : i < index ? ' before' : ' after'}`}>
              <Photo src={src || undefined} alt={`${p.name}, foto ${i + 1}`} />
            </div>
          ))}
          {many && (
            <>
              <button className="nav p" onClick={() => go(index - 1)} aria-label="Foto anterior">
                ‹
              </button>
              <button className="nav n" onClick={() => go(index + 1)} aria-label="Foto siguiente">
                ›
              </button>
              <span className="count">
                {index + 1} / {images.length}
              </span>
            </>
          )}
          {images[0] && <span className="hint">Tocá para ampliar</span>}
        </div>
        {many && (
          <div className="thumbs">
            {images.map((src, i) => (
              <button key={i} className="th" aria-current={i === index} aria-label={`Foto ${i + 1}`} onClick={() => go(i)} style={{ position: 'relative' }}>
                <Photo src={src} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pinfo">
        <span className="cat">{p.category}</span>
        <h2>{p.name}</h2>
        <div className="big">{money(variant?.price ?? p.price)}</div>
        <div className="legal">
          {taxCondition === 'RESPONSABLE_INSCRIPTO' && variant?.netPrice != null
            ? `Precio final con IVA · Precio sin impuestos nacionales: ${money(variant.netPrice)}`
            : 'Precio final'}
        </div>
        {p.variants.length > 1 && (
          <div className="st-cats" style={{ padding: 0 }} role="group" aria-label="Opciones">
            {p.variants.map((v) => (
              <button key={v.id} className="chip" aria-pressed={v.id === variant?.id} onClick={() => setVariantId(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
        )}
        <div className={`stock${stock ? ' low' : ''}`}>
          <i />
          {stock ? `${stock} en stock` : 'Hay stock'}
        </div>
        {p.description && <p>{p.description}</p>}
        <div className="buy">
          <div className="qty">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Menos">
              −
            </button>
            <span>{qty}</span>
            <button onClick={() => setQty((q) => Math.min(variant?.stockShown ?? 99, q + 1))} aria-label="Más">
              +
            </button>
          </div>
          <button
            className="cta"
            onClick={(e) => {
              if (!variant) return;
              onAdd(variant.id, qty, e.currentTarget);
              setAdded(true);
              window.setTimeout(() => setAdded(false), 1400);
            }}
          >
            {added ? 'Agregado ✓' : 'Agregar al pedido'}
          </button>
        </div>
        {ask && (
          <a className="ghost" href={ask} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Consultar por WhatsApp
          </a>
        )}
        <dl className="specs">
          {p.sku && (
            <>
              <dt>Código</dt>
              <dd>{p.sku}</dd>
            </>
          )}
          <dt>Categoría</dt>
          <dd>{p.category}</dd>
        </dl>
      </div>
    </div>
  );
}

function CartDrawer({
  store,
  preview,
  cart,
  variantIndex,
  onChange,
  onClear,
  onClose,
}: {
  store: StorefrontStore;
  preview: boolean;
  cart: Cart;
  variantIndex: Map<string, { product: StorefrontProduct; variant: StorefrontVariant }>;
  onChange: (variantId: string, qty: number) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<StorefrontOrderResult | null>(null);

  const items = Object.entries(cart)
    .map(([id, qty]) => ({ id, qty, entry: variantIndex.get(id) }))
    .filter((i): i is { id: string; qty: number; entry: { product: StorefrontProduct; variant: StorefrontVariant } } => !!i.entry && i.qty > 0);
  const total = items.reduce((sum, i) => sum + i.entry.variant.price * i.qty, 0);

  async function submit() {
    setError('');
    if (name.trim().length < 2) {
      setError('Escribí tu nombre para que sepan quién hace el pedido');
      return;
    }
    if (preview) {
      setError('Vista previa: el pedido no se envía. En la tienda publicada sí.');
      return;
    }
    setSending(true);
    try {
      const res = await sendStorefrontOrder(store.subdomain, {
        customerName: name.trim(),
        customerPhone: phone.trim() || undefined,
        note: note.trim() || undefined,
        lines: items.map((i) => ({ variantId: i.id, quantity: i.qty })),
      });
      setResult(res);
      onClear();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <aside className="drawer" aria-label="Mi pedido">
      <div className="dh">
        <h3>Mi pedido</h3>
        <button className="x" style={{ position: 'static' }} onClick={onClose} aria-label="Cerrar">
          ×
        </button>
      </div>
      <div className="dl">
        {result ? (
          <div style={{ padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="msgcap">Pedido #{result.number} recibido</span>
            {result.whatsappUrl ? (
              <>
                <span className="legal">Falta un paso: mandá este mensaje por WhatsApp para que {store.name} te confirme stock, envío y forma de pago.</span>
                <div className="msg">{result.message}</div>
                <a className="cta" href={result.whatsappUrl} target="_blank" rel="noopener noreferrer" style={{ justifyContent: 'center', textDecoration: 'none', background: '#1f9d55', color: '#fff' }}>
                  Abrir WhatsApp y enviar
                </a>
              </>
            ) : (
              <span className="legal">{store.name} ya lo recibió y se va a comunicar con vos para confirmar stock, envío y forma de pago.</span>
            )}
            <button className="ghost" onClick={() => setResult(null)}>
              Seguir mirando
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="empty">
            Todavía no agregaste nada.
            <br />
            Tocá “Agregar” en los artículos que te gusten.
          </div>
        ) : (
          items.map(({ id, qty, entry: { product, variant } }) => (
            <div className="li" key={id}>
              <div className="m" style={{ position: 'relative' }}>
                <Photo src={product.images[0]} alt={product.name} />
              </div>
              <div>
                <b>{product.name}</b>
                <small>
                  {product.variants.length > 1 ? `${variant.label} · ` : ''}
                  {money(variant.price)} c/u
                </small>
              </div>
              <div className="qty">
                <button onClick={() => onChange(id, qty - 1)} aria-label="Menos">
                  −
                </button>
                <span>{qty}</span>
                <button onClick={() => onChange(id, qty + 1)} aria-label="Más">
                  +
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      {!result && items.length > 0 && (
        <div className="df">
          <div className="tot">
            <span>Total</span>
            <span>{money(total)}</span>
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" aria-label="Tu nombre" maxLength={80} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Tu teléfono (opcional)" aria-label="Tu teléfono" maxLength={30} inputMode="tel" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="¿Algo más? (envío, horario, color)" aria-label="Nota" maxLength={500} />
          {error && <span className="legal" style={{ color: '#c0392b' }}>{error}</span>}
          <button className="cta" onClick={submit} disabled={sending}>
            {sending ? 'Enviando…' : store.whatsappNumber ? 'Enviar pedido por WhatsApp' : 'Enviar pedido'}
          </button>
          <span className="note">No se cobra nada ahora. {store.name} te confirma stock, envío y forma de pago.</span>
        </div>
      )}
    </aside>
  );
}

function Typewriter({ text, reduceMotion }: { text: string; reduceMotion: boolean }) {
  const [shown, setShown] = useState(reduceMotion ? text : '');
  useEffect(() => {
    if (reduceMotion) {
      setShown(text);
      return;
    }
    let i = 0;
    setShown('');
    const timer = window.setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) window.clearInterval(timer);
    }, 70);
    return () => window.clearInterval(timer);
  }, [text, reduceMotion]);
  return (
    <>
      <span aria-label={text}>{shown}</span>
      <span className="cur" aria-hidden />
    </>
  );
}

function Marquee({ words, sep }: { words: string[]; sep: string }) {
  const line = (words.join(sep) + sep).repeat(6);
  return (
    <div className="extra marq" aria-hidden>
      <span>{line}</span>
      <span>{line}</span>
    </div>
  );
}

function Ring({ products }: { products: StorefrontProduct[] }) {
  const items = Array.from({ length: 8 }, (_, i) => products[i % products.length]);
  return (
    <div className="extra ring" aria-hidden>
      <div className="rot">
        {items.map((p, i) => (
          <div key={i} style={{ transform: `rotateY(${i * 45}deg) translateZ(260px)` }}>
            <Photo src={p.images[0]} alt="" />
          </div>
        ))}
      </div>
    </div>
  );
}
