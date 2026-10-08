'use client';

import type { StorefrontProduct } from '@/lib/storefront';
import { useEffect, useRef, useState } from 'react';
import {
  catImage,
  createPortal,
  DragStrip,
  fitSize,
  fromPrice,
  inCat,
  money,
  netNote,
  Options,
  pad2,
  photo,
  photos,
  priceNote,
  pricesNote,
  scrollTo,
  specRows,
  uploadUrl,
  useVariant,
  type StoreCtx,
  type TemplateModule,
} from '../shared';

/** 2 · Atelier — revista de lujo: menú a pantalla completa, título que se
 * revela, productos en zigzag, cursor "Ver", ficha con tira horizontal. */

/** El título de portada en tres renglones; el del medio va en itálica. */
function threeLines(text: string | null): string[] {
  if (!text) return ['Piezas', 'elegidas', 'con cuidado.'];
  const words = text.trim().split(/\s+/);
  if (words.length < 3) return words;
  const size = Math.ceil(words.length / 3);
  return [words.slice(0, size), words.slice(size, size * 2), words.slice(size * 2)].map((w) => w.join(' ')).filter(Boolean);
}

function Page({ ctx }: { ctx: StoreCtx }) {
  const { store, categories } = ctx;
  const screen = ctx.screen;
  const cursor = useRef<HTMLDivElement>(null);
  const arch = useRef<HTMLImageElement>(null);
  const feat = ctx.featured.slice(0, 6);
  const rest = ctx.featured.slice(6);
  const lines = threeLines(store.heroTitle);

  // Cursor "Ver" sobre las fotos y parallax de la foto en arco.
  useEffect(() => {
    if (!screen) return;
    const onMove = (e: PointerEvent) => {
      const c = cursor.current;
      if (!c || e.pointerType !== 'mouse') return;
      const r = screen.getBoundingClientRect();
      c.style.left = `${e.clientX - r.left}px`;
      c.style.top = `${e.clientY - r.top}px`;
      c.classList.toggle('on', !!(e.target as HTMLElement).closest('[data-cur]'));
    };
    const onLeave = () => cursor.current?.classList.remove('on');
    const onScroll = () => {
      if (arch.current && !ctx.reduce) arch.current.style.transform = `translateY(${-Math.min(screen.scrollTop * 0.12, 120)}px)`;
    };
    screen.addEventListener('pointermove', onMove);
    screen.addEventListener('pointerleave', onLeave);
    screen.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      screen.removeEventListener('pointermove', onMove);
      screen.removeEventListener('pointerleave', onLeave);
      screen.removeEventListener('scroll', onScroll);
    };
  }, [screen, ctx.reduce]);

  const marquee = categories.length > 0 ? categories : [store.name];

  return (
    <>
      <header className="t-nav">
        <button className="m l" onClick={ctx.openMenu}>
          <i />
          <span>Menú</span>
        </button>
        <div className="logo">
          {store.logoUrl ? <img src={uploadUrl(store.logoUrl)} alt={store.name} style={{ height: 34, width: 'auto' }} /> : store.name}
        </div>
        <button className="r" onClick={ctx.openCart}>
          Pedido — <span>{ctx.count}</span>
        </button>
      </header>

      <section className="t-hero">
        <div>
          <h1>
            {lines.map((line, i) => (
              <span className="ln" key={i}>
                <span>{i === 1 ? <em>{line}</em> : line}</span>
              </span>
            ))}
          </h1>
          <div className="sub">
            <p>{store.heroSubtitle || 'Una selección pensada para durar. Pocas piezas, buenas, y siempre con stock real.'}</p>
            <a
              href="#tidx"
              onClick={(e) => {
                e.preventDefault();
                scrollTo(ctx, '#tidx');
              }}
            >
              Ver el índice
            </a>
          </div>
        </div>
        <figure className="t-arch">
          {ctx.cover && <img ref={arch} src={ctx.cover} alt={store.name} />}
          <figcaption>Temporada {String(new Date().getFullYear()).slice(2)}</figcaption>
        </figure>
      </section>

      <div className="t-marq" aria-hidden>
        <div>
          {Array.from({ length: 4 }).flatMap((_, k) =>
            marquee.flatMap((c) => [
              <span key={`${k}-${c}`}>{c}</span>,
              <b key={`${k}-${c}-b`}>✦</b>,
            ]),
          )}
        </div>
      </div>

      <section className="t-index" id="tidx">
        <h2 data-rv>
          Índice
          <br />
          de temporada
        </h2>
        <p data-rv>
          {feat.length === 1 ? 'La pieza destacada' : `Las ${feat.length} piezas destacadas`}
          {rest.length > 0 ? ' y, debajo, el resto del catálogo' : ''}. Todo se pide{store.whatsappNumber ? ' por WhatsApp' : ' desde acá'} y la entrega se coordina con {store.name}.
        </p>
      </section>

      <section className="t-rows">
        {feat.map((p, i) => (
          <article className="t-row" data-rv key={p.id}>
            <div className="ph" data-cur onClick={() => ctx.open(p.id)}>
              <img src={photo(p)} alt={p.name} loading="lazy" />
            </div>
            <div className="tx">
              <div className="no">
                N.º {pad2(i + 1)} — {p.category}
              </div>
              <h3>{p.name}</h3>
              {p.description && <p className="ds">{p.description}</p>}
              <div className="pr">{fromPrice(p)}</div>
              <div className="ac">
                <button className="p" onClick={(e) => ctx.add(p, undefined, 1, e.currentTarget)}>
                  Agregar al pedido
                </button>
                <button onClick={() => ctx.open(p.id)}>Ver la ficha</button>
              </div>
            </div>
          </article>
        ))}
        {feat.length === 0 && <p className="empty-note">Todavía no hay artículos publicados.</p>}
      </section>

      {rest.length > 0 && (
        <section className="t-more">
          <h2 data-rv>Más del catálogo</h2>
          <div className="t-grid">
            {rest.map((p) => (
              <div className="t-card" data-cur data-rv key={p.id} onClick={() => ctx.open(p.id)}>
                <div className="ph">
                  <img src={photo(p)} alt={p.name} loading="lazy" />
                </div>
                <h4>{p.name}</h4>
                <span>{fromPrice(p)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="t-foot">
        <div className="big" style={{ fontSize: `clamp(48px, ${fitSize(store.name, 130, 12)}, 190px)` }}>
          {store.name}
        </div>
        <p>
          {[store.address, store.whatsappNumber ? `Pedidos por WhatsApp ${store.whatsappNumber}` : null].filter(Boolean).join(' · ')}
          <br />
          {pricesNote(ctx)} · Hecho con Oplex
        </p>
      </footer>

      {ctx.hud &&
        createPortal(
          <div className="t-cursor" ref={cursor} aria-hidden>
            Ver
          </div>,
          ctx.hud,
        )}
    </>
  );
}

function Menu({ ctx }: { ctx: StoreCtx }) {
  const [img, setImg] = useState(ctx.cover);
  function goTo(c: string) {
    ctx.close();
    const first = inCat(ctx, c)[0];
    const index = first ? ctx.featured.indexOf(first) : 0;
    window.setTimeout(() => {
      const items = ctx.screen?.querySelectorAll('.t-row,.t-card');
      (items?.[index] ?? items?.[0])?.scrollIntoView({ block: 'center', behavior: ctx.reduce ? 'auto' : 'smooth' });
    }, 300);
  }
  return (
    <div className="menu">
      <button className="x" onClick={ctx.close}>
        Cerrar ×
      </button>
      <ul>
        {ctx.categories.map((c) => (
          <li key={c} onPointerEnter={() => setImg(catImage(ctx, c))}>
            <button onClick={() => goTo(c)}>
              {c}
              <sup>{inCat(ctx, c).length}</sup>
            </button>
          </li>
        ))}
        <li onPointerEnter={() => setImg(ctx.cover)}>
          <button onClick={ctx.openCart}>
            Pedido<sup>{ctx.count}</sup>
          </button>
        </li>
      </ul>
      <div className="prev">{img && <img src={img} alt="" />}</div>
    </div>
  );
}

function View({ ctx, p }: { ctx: StoreCtx; p: StorefrontProduct }) {
  const [v, setV] = useVariant(p);
  const n = photos(p).length;
  const net = netNote(ctx, v);
  return (
    <div className="pv" role="dialog" aria-modal="true" aria-label={p.name}>
      <button className="x" onClick={ctx.close}>
        Cerrar ×
      </button>
      <DragStrip p={p} />
      <div className="cnt">{n > 1 ? `${n} fotos · arrastrá para ver →` : '1 foto'}</div>
      <div className="pvi">
        <div>
          <div className="no">
            N.º {pad2(ctx.featured.indexOf(p) + 1)} — {p.category}
          </div>
          <h2>{p.name}</h2>
        </div>
        <div className="bx">
          {p.description && <p>{p.description}</p>}
          <div className="pr">{money(v?.price ?? p.price)}</div>
          <p style={{ fontSize: 12.5, marginTop: -10 }}>
            {priceNote(ctx)}
            {net ? ` · ${net}` : ''}
          </p>
          <Options p={p} value={v} onChange={setV} />
          <button className="addb" onClick={(e) => v && ctx.add(p, v.id, 1, e.currentTarget)}>
            Agregar al pedido
          </button>
          <p style={{ fontSize: 13 }}>
            {specRows(p, v)
              .map(([k, val]) => `${k}: ${val}`)
              .join(' · ')}
          </p>
        </div>
      </div>
    </div>
  );
}

const Atelier: TemplateModule = { Page, View, Menu };
export default Atelier;
