'use client';

import type { StorefrontProduct } from '@/lib/storefront';
import { useEffect, useState } from 'react';
import {
  catImage,
  fitSize,
  fromPrice,
  inCat,
  lowLabel,
  money,
  netNote,
  Options,
  photo,
  photos,
  priceNote,
  pricesNote,
  scrollTo,
  season,
  SpecsDl,
  useVariant,
  type StoreCtx,
  type TemplateModule,
} from '../shared';

/** 1 · Aire — galería minimal: portada a pantalla completa, grilla bento,
 * ficha con fotos apiladas y panel fijo. */

// [columnas, filas, tipo] de cada recuadro de la grilla (12 columnas).
const LAYOUT: [number, number, string?][] = [
  [7, 2, 'feat'],
  [5, 1],
  [5, 1],
  [4, 2],
  [4, 1],
  [4, 1],
  [4, 1],
  [4, 1],
  [6, 2],
  [6, 1],
  [3, 1],
  [3, 1],
  [8, 1, 'w2'],
  [4, 1],
  [4, 1],
  [4, 1],
  [4, 1],
];

function tagOf(p: StorefrontProduct): string {
  if (p.isNew) return 'Nuevo';
  return lowLabel(p.stockShown) ? 'Últimas' : '';
}

function Page({ ctx }: { ctx: StoreCtx }) {
  const { store, categories } = ctx;
  const [cat, setCat] = useState<string | null>(null);
  const [solid, setSolid] = useState(false);
  const screen = ctx.screen;

  useEffect(() => {
    if (!screen) return;
    const onScroll = () => setSolid(screen.scrollTop > screen.clientHeight * 0.7);
    onScroll();
    screen.addEventListener('scroll', onScroll, { passive: true });
    return () => screen.removeEventListener('scroll', onScroll);
  }, [screen]);

  const list = cat ? inCat(ctx, cat) : ctx.featured;
  const pick = (c: string | null) => {
    setCat(c);
    scrollTo(ctx, '#abento');
  };
  const name = store.name.toUpperCase();

  return (
    <>
      <header className={`a-nav${solid ? ' solid' : ''}`}>
        <nav>
          {categories.slice(0, 3).map((c) => (
            <a
              key={c}
              href="#abento"
              onClick={(e) => {
                e.preventDefault();
                pick(c);
              }}
            >
              {c}
            </a>
          ))}
        </nav>
        <div className="logo">{name}</div>
        <div className="r">
          <button className="s" onClick={() => pick(null)}>
            Catálogo
          </button>
          <button onClick={ctx.openCart}>
            Pedido
            <span className="cnt">
              <b>{ctx.count}</b>
            </span>
          </button>
        </div>
      </header>

      <section className="a-hero">
        {ctx.cover && <img src={ctx.cover} alt={store.name} />}
        <div className="in">
          <div>
            <div className="lab">
              Temporada {season()} · {new Date().getFullYear()}
            </div>
            <h1>
              {store.heroTitle || (
                <>
                  Recién
                  <br />
                  llegado.
                </>
              )}
            </h1>
          </div>
          <button className="go" onClick={() => scrollTo(ctx, '#abento')}>
            Ver la
            <br />
            colección ↓
          </button>
        </div>
      </section>

      <section className="a-intro">
        <div className="k">01 — Selección</div>
        <p data-rv>
          {store.heroSubtitle || (
            <>
              Todo lo que ves está en stock.{' '}
              <span>
                Elegí lo que te guste, armá tu pedido y te lo confirmamos{store.whatsappNumber ? ' por WhatsApp' : ''}.
              </span>
            </>
          )}
        </p>
      </section>

      <div className="a-filter" id="abento">
        <button aria-pressed={!cat} onClick={() => setCat(null)}>
          Todo
        </button>
        {categories.map((c) => (
          <button key={c} aria-pressed={cat === c} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>

      <section className="a-bento">
        {list.map((p, i) => {
          const [c, r, k] = cat ? [4, 1] : (LAYOUT[i] ?? [4, 1]);
          const feat = k === 'feat';
          const tag = tagOf(p);
          return (
            <article
              key={p.id}
              className={`a-t${feat ? ' feat' : ''}${k === 'w2' ? ' w2' : ''}`}
              style={{ gridColumn: `span ${c}`, gridRow: `span ${r}` }}
              onClick={() => ctx.open(p.id)}
              data-rv
            >
              <img className="a" src={photo(p, feat ? 2 : 0)} alt={p.name} loading="lazy" />
              {p.images[1] && <img className="b" src={photo(p, 1)} alt="" loading="lazy" />}
              {feat && (
                <span className="cap">
                  {p.category}
                  <br />
                  {p.isNew ? 'recién llegado' : 'destacado'}
                </span>
              )}
              {tag && !feat && <span className="tag">{tag}</span>}
              <div className="meta">
                <span className="nm">
                  <span>{p.name}</span>
                  <b>{fromPrice(p)}</b>
                </span>
                <button
                  className="plus"
                  aria-label={`Agregar ${p.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    ctx.add(p, undefined, 1, e.currentTarget);
                  }}
                >
                  +
                </button>
              </div>
            </article>
          );
        })}
        {list.length === 0 && <p className="empty-note" style={{ gridColumn: '1 / -1' }}>Todavía no hay artículos publicados.</p>}
      </section>

      {categories.length > 1 && (
        <section className="a-strip">
          <h2 data-rv>
            Por categoría <small>{categories.length} categorías →</small>
          </h2>
          <div className="a-row">
            {categories.map((c) => (
              <div key={c} className="a-cat" onClick={() => pick(c)}>
                <div className="im">
                  <img src={catImage(ctx, c)} alt={c} loading="lazy" />
                </div>
                <p>
                  {c}
                  <span>{inCat(ctx, c).length} art.</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="a-foot">
        <div>
          <div className="big" style={{ fontSize: `clamp(28px, ${fitSize(name, 56, 7)}, 110px)` }}>
            {name}
          </div>
        </div>
        <div>
          <b>Tienda</b>
          {store.address || store.name}
        </div>
        <div>
          <b>Pedidos</b>
          {store.whatsappNumber ? (
            <>
              Por WhatsApp
              <br />
              {store.whatsappNumber}
            </>
          ) : (
            'Desde esta página'
          )}
        </div>
        <div>
          <b>Precios</b>
          {pricesNote(ctx)}
          <br />
          Hecho con Oplex
        </div>
      </footer>
    </>
  );
}

function View({ ctx, p }: { ctx: StoreCtx; p: StorefrontProduct }) {
  const [v, setV] = useVariant(p);
  const net = netNote(ctx, v);
  return (
    <>
      <div className="scrim" />
      <div className="pv" role="dialog" aria-modal="true" aria-label={p.name}>
        <button className="x" onClick={ctx.close} aria-label="Cerrar">
          ×
        </button>
        <div className="stack">
          {photos(p).map((src, i) => (
            <img key={i} src={src} alt={`${p.name}, foto ${i + 1}`} />
          ))}
        </div>
        <div className="side">
          <div className="crumb">
            {p.category}
            {p.sku ? ` / ${p.sku}` : ''}
          </div>
          <h2>{p.name}</h2>
          <div className="pr">{money(v?.price ?? p.price)}</div>
          <div className="lg">
            {priceNote(ctx)} · {lowLabel(v?.stockShown) || 'Hay stock'}
            {net && (
              <>
                <br />
                {net}
              </>
            )}
          </div>
          <Options p={p} value={v} onChange={setV} cls="chips" />
          <button className="addb" onClick={(e) => v && ctx.add(p, v.id, 1, e.currentTarget)}>
            <span>Agregar al pedido</span>
            <span>→</span>
          </button>
          {p.description && (
            <details open>
              <summary>Descripción</summary>
              <p style={{ marginTop: 8, color: '#55544f' }}>{p.description}</p>
            </details>
          )}
          <details open={!p.description}>
            <summary>Detalles</summary>
            <SpecsDl p={p} v={v} />
          </details>
          <details>
            <summary>Entrega</summary>
            <p style={{ marginTop: 8, color: '#55544f' }}>
              El envío o el retiro se coordinan con {ctx.store.name} al confirmar el pedido{ctx.store.whatsappNumber ? ' por WhatsApp' : ''}.
            </p>
          </details>
        </div>
      </div>
    </>
  );
}

const Aire: TemplateModule = { Page, View };
export default Aire;
