'use client';

import { storefrontFontsHref, type StorefrontPayload, type StorefrontProduct, type StorefrontTemplate } from '@/lib/storefront';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CartPanel, lowLabel, photo, uploadUrl, type Cart, type LayerKind, type StoreCtx, type TemplateModule } from './shared';
import './storefront.css';
import Aire from './templates/Aire';
import Atelier from './templates/Atelier';
import Mercado from './templates/Mercado';
import Neon from './templates/Neon';
import Pop from './templates/Pop';
import Revista from './templates/Revista';
import Taller from './templates/Taller';
import Vitrina from './templates/Vitrina';

/**
 * La tienda online pública (y su vista previa dentro de Oplex). Replica el
 * boceto v2 aprobado: cada plantilla es su propia página, ficha y menú
 * (templates/*); acá vive lo común: el pedido, las capas que se abren
 * encima, el aviso de "agregado" y las apariciones al bajar.
 */

const TEMPLATES: Record<StorefrontTemplate, TemplateModule> = {
  aire: Aire,
  atelier: Atelier,
  pop: Pop,
  taller: Taller,
  mercado: Mercado,
  neon: Neon,
  revista: Revista,
  vitrina: Vitrina,
};

const TOAST: Partial<Record<StorefrontTemplate, (p: StorefrontProduct, qty: number) => string>> = {
  pop: () => '¡Al pedido!',
  taller: (p, qty) => `+${qty} ${p.sku || p.name} agregado`,
  atelier: () => 'Agregado al pedido',
  revista: () => 'Agregado al pedido',
};

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

/** Texto negro o blanco sobre el color que eligió la empresa. */
function inkFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return lum > 0.45 ? '#111' : '#fff';
}

function confetti(hud: HTMLElement, x: number, y: number) {
  const colors = ['#ff4f2e', '#2b59ff', '#ffd400', '#141414', '#7ed957', '#ff9cc6'];
  for (let i = 0; i < 22; i++) {
    const s = document.createElement('i');
    const a = Math.random() * Math.PI * 2;
    const d = 50 + Math.random() * 80;
    s.className = 'conf';
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.background = colors[i % colors.length];
    hud.appendChild(s);
    requestAnimationFrame(() => {
      s.style.transform = `translate(${Math.cos(a) * d}px,${Math.sin(a) * d - 30}px) rotate(${Math.random() * 600}deg)`;
      s.style.opacity = '0';
    });
    window.setTimeout(() => s.remove(), 950);
  }
}

interface Props {
  data: StorefrontPayload;
  // Vista previa dentro de Oplex: todo funciona, pero el pedido no se envía.
  preview?: boolean;
}

export default function Storefront({ data, preview = false }: Props) {
  const { store, products, categories, taxCondition } = data;
  const t: StorefrontTemplate = store.template in TEMPLATES ? store.template : 'aire';
  const T = TEMPLATES[t];
  const reduce = useReducedMotion();

  const [screen, setScreen] = useState<HTMLDivElement | null>(null);
  const [hud, setHud] = useState<HTMLDivElement | null>(null);
  const [layer, setLayer] = useState<{ kind: LayerKind; productId?: string } | null>(null);
  const [layerOpen, setLayerOpen] = useState(false);
  const [cart, setCart] = useCart(store.subdomain, products, preview);
  const [slide, setSlide] = useState(0);
  const [toast, setToast] = useState<{ msg: string; show: boolean }>({ msg: '', show: false });
  const [revealOn, setRevealOn] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const toastTimer = useRef<number | undefined>(undefined);

  const featured = useMemo(
    () => [...products].sort((a, b) => Number(b.images.length > 0) - Number(a.images.length > 0) || Number(b.isNew) - Number(a.isNew)),
    [products],
  );
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const total = useMemo(() => {
    let sum = 0;
    for (const p of products) for (const v of p.variants) sum += (cart[v.id] ?? 0) * v.price;
    return sum;
  }, [cart, products]);

  const openLayer = useCallback((kind: LayerKind, productId?: string) => {
    window.clearTimeout(closeTimer.current);
    setLayer({ kind, productId });
    setLayerOpen(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setLayerOpen(true)));
  }, []);
  const close = useCallback(() => {
    setLayerOpen(false);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setLayer(null), 700);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast({ msg, show: true });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast((s) => ({ ...s, show: false })), 1700);
  }, []);

  const add = useCallback(
    (p: StorefrontProduct, variantId?: string, qty = 1, el?: HTMLElement | null) => {
      if (!variantId && p.variants.length > 1) {
        openLayer('pv', p.id);
        return;
      }
      const v = p.variants.find((x) => x.id === (variantId ?? p.variants[0]?.id));
      if (!v) return;
      const have = cart[v.id] ?? 0;
      const max = v.stockShown ?? 99;
      const next = Math.min(max, have + qty);
      if (next === have) {
        showToast(v.stockShown != null ? `${lowLabel(max) || `Hay ${max}`}: ya están en tu pedido` : 'Ya está en tu pedido');
        return;
      }
      setCart((c) => ({ ...c, [v.id]: next }));
      showToast(TOAST[t]?.(p, next - have) ?? `Agregado: ${p.name}`);
      if (t === 'pop' && hud) {
        const bubble = hud.querySelector<HTMLElement>('.p-bubble');
        if (bubble) {
          bubble.classList.remove('jig');
          void bubble.offsetWidth;
          bubble.classList.add('jig');
        }
        if (el && !reduce) {
          const r = el.getBoundingClientRect();
          const d = hud.getBoundingClientRect();
          confetti(hud, r.left - d.left + r.width / 2, r.top - d.top + r.height / 2);
        }
      }
    },
    [cart, hud, openLayer, reduce, setCart, showToast, t],
  );

  const setQty = useCallback(
    (variantId: string, qty: number) =>
      setCart((c) => {
        const next = { ...c };
        if (qty <= 0) delete next[variantId];
        else next[variantId] = Math.min(99, qty);
        return next;
      }),
    [setCart],
  );

  // Escape cierra lo que esté abierto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // Al cambiar de plantilla (vista previa): todo cerrado y arriba de todo.
  useEffect(() => {
    setLayer(null);
    setLayerOpen(false);
    setSlide(0);
  }, [t]);

  // Aparición al bajar (data-rv): se marca con data-in, que React no pisa.
  useEffect(() => {
    if (!screen || reduce) {
      setRevealOn(false);
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          (e.target as HTMLElement).dataset.in = '1';
          io.unobserve(e.target);
        }),
      { root: screen, threshold: 0.12 },
    );
    const scan = () => screen.querySelectorAll<HTMLElement>('[data-rv]:not([data-in])').forEach((el) => io.observe(el));
    scan();
    setRevealOn(true);
    const mo = new MutationObserver(scan);
    mo.observe(screen, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [screen, reduce]);

  const cover = store.coverUrl ? uploadUrl(store.coverUrl) : featured[0] ? photo(featured[0]) : '';

  const ctx: StoreCtx = {
    store,
    products,
    featured,
    categories,
    taxCondition,
    preview,
    reduce,
    cover,
    cart,
    count,
    total,
    screen,
    hud,
    add,
    setQty,
    qtyOf: (p) => p.variants.reduce((sum, v) => sum + (cart[v.id] ?? 0), 0),
    open: (id) => openLayer('pv', id),
    openCart: () => openLayer('cart'),
    openMenu: () => openLayer('menu'),
    close,
    layerOpen: layer !== null,
    slide,
    setSlide,
  };

  const style = store.accentColor ? ({ '--acc': store.accentColor, '--acc-ink': inkFor(store.accentColor) } as React.CSSProperties) : undefined;
  const product = layer?.kind === 'pv' ? products.find((p) => p.id === layer.productId) : undefined;
  const Menu = T.Menu;

  return (
    <div className={`sf${preview ? ' sf-preview' : ''}`} data-t={t} style={style}>
      <link rel="stylesheet" href={storefrontFontsHref(t)} precedence="default" />
      <div key={t} ref={setScreen} className={`screen T T-${t}${revealOn ? ' rvon' : ''}${T.locked ? ' lock' : ''}`}>
        <T.Page ctx={ctx} />
      </div>
      <div ref={setHud} className="hud">
        <div className={`toast${toast.show ? ' show' : ''}`} role="status" aria-live="polite">
          {toast.msg}
        </div>
      </div>
      <div className={`layer L-${t}${layer ? ` K-${layer.kind}` : ''}${layerOpen ? ' open' : ''}`} aria-hidden={!layer}>
        {product && <T.View key={product.id} ctx={ctx} p={product} />}
        {layer?.kind === 'cart' && (
          <>
            <div className="scrim" onClick={close} />
            <CartPanel ctx={ctx} onCleared={() => setCart({})} />
          </>
        )}
        {layer?.kind === 'menu' && Menu && (
          <>
            <div className="scrim" />
            <Menu ctx={ctx} />
          </>
        )}
      </div>
    </div>
  );
}
