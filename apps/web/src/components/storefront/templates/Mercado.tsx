'use client';

import type { StorefrontProduct } from '@/lib/storefront';
import { useEffect, useRef, useState } from 'react';
import {
  createPortal,
  fromPrice,
  inCat,
  lowLabel,
  money,
  netNote,
  Options,
  photo,
  priceNote,
  pricesNote,
  scrollTo,
  SnapGallery,
  specRows,
  uploadUrl,
  useVariant,
  type StoreCtx,
  type TemplateModule,
} from '../shared';

/** 5 · Mercado — como una app de delivery: tapa con datos del local,
 * pestañas que siguen el scroll, + y − directo, barra de pedido fija abajo. */

const secId = (ctx: StoreCtx, c: string) => `ms-${ctx.categories.indexOf(c)}`;

function Step({ ctx, p }: { ctx: StoreCtx; p: StorefrontProduct }) {
  const q = ctx.qtyOf(p);
  const plus = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    ctx.add(p, undefined, 1, e.currentTarget);
  };
  if (!q) {
    return (
      <div className="m-step">
        <button onClick={plus} aria-label={`Agregar ${p.name}`}>
          +
        </button>
      </div>
    );
  }
  // Con varias opciones, "−" saca de la última que tenga algo.
  const last = [...p.variants].reverse().find((v) => (ctx.cart[v.id] ?? 0) > 0);
  return (
    <div className="m-step has">
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (last) ctx.setQty(last.id, (ctx.cart[last.id] ?? 0) - 1);
        }}
        aria-label="Quitar uno"
      >
        −
      </button>
      <b>{q}</b>
      <button onClick={plus} aria-label="Agregar uno">
        +
      </button>
    </div>
  );
}

function Page({ ctx }: { ctx: StoreCtx }) {
  const { store, categories } = ctx;
  const screen = ctx.screen;
  const [q, setQ] = useState('');
  const [active, setActive] = useState(categories[0] ?? '');
  const tabs = useRef<HTMLDivElement>(null);
  const needle = q.trim().toLowerCase();
  const match = (p: StorefrontProduct) => !needle || `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(needle);
  const sections = categories.map((c) => ({ c, items: inCat(ctx, c).filter(match) })).filter((s) => s.items.length > 0);
  const promo = ctx.featured.find((p) => p.isNew) ?? ctx.featured[1] ?? ctx.featured[0];

  // Pestaña activa según la sección que se está viendo.
  useEffect(() => {
    if (!screen) return;
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) setActive((e.target as HTMLElement).dataset.sec ?? '');
        }),
      { root: screen, rootMargin: '-30% 0px -60% 0px' },
    );
    screen.querySelectorAll('[data-sec]').forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [screen, needle]);

  useEffect(() => {
    const on = tabs.current?.querySelector<HTMLElement>('button.on');
    on?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: ctx.reduce ? 'auto' : 'smooth' });
  }, [active, ctx.reduce]);

  return (
    <>
      <div className="m-cover">{ctx.cover && <img src={ctx.cover} alt={store.name} />}</div>
      <div className="m-wrap">
        <div className="m-store">
          <div className="m-logo" style={store.logoUrl ? { background: '#fff', padding: 6 } : undefined}>
            {store.logoUrl ? (
              <img src={uploadUrl(store.logoUrl)} alt={store.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              store.name.trim()[0]?.toUpperCase()
            )}
          </div>
          <div>
            <h1>{store.name}</h1>
            <div className="info">
              <span>
                <b>● Pedidos online</b>
              </span>
              {store.address && <span>{store.address}</span>}
              <span>
                {ctx.products.length} {ctx.products.length === 1 ? 'producto' : 'productos'}
              </span>
            </div>
          </div>
          <label className="m-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar en ${store.name}`} aria-label="Buscar" />
          </label>
        </div>
      </div>

      <div className="m-tabs">
        <div className="m-wrap">
          <div className="in" ref={tabs}>
            {sections.map(({ c }) => (
              <button key={c} className={c === active ? 'on' : ''} onClick={() => scrollTo(ctx, `#${secId(ctx, c)}`)}>
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="m-wrap">
        {!needle && (
          <div className="m-promos">
            <div className="m-promo" style={{ background: 'var(--g)', color: 'var(--acc-ink)' }}>
              <div>
                <h3>{store.heroTitle || 'Armá tu pedido acá'}</h3>
                <p>{store.heroSubtitle || (store.whatsappNumber ? 'Te lo confirmamos por WhatsApp' : 'Te contactamos para confirmarlo')}</p>
              </div>
              {ctx.cover && <img src={ctx.cover} alt="" />}
            </div>
            {promo && (
              <div className="m-promo" style={{ background: '#ffe9d6', color: '#7a3300', cursor: 'pointer' }} onClick={() => ctx.open(promo.id)}>
                <div>
                  <h3>
                    {promo.isNew ? 'Nuevo: ' : ''}
                    {promo.name}
                  </h3>
                  <p>{fromPrice(promo)}</p>
                </div>
                <img src={photo(promo)} alt="" />
              </div>
            )}
          </div>
        )}

        {sections.map(({ c, items }) => (
          <section className="m-sec" id={secId(ctx, c)} data-sec={c} key={c}>
            <h2>
              {c}
              <small>
                {items.length} {items.length === 1 ? 'producto' : 'productos'}
              </small>
            </h2>
            <div className="m-row">
              {items.map((p) => {
                const low = lowLabel(p.stockShown);
                return (
                  <article className="m-p" key={p.id} onClick={() => ctx.open(p.id)}>
                    <div className="im">
                      <img src={photo(p)} alt={p.name} loading="lazy" />
                      {p.isNew && <span className="m-tag">Nuevo</span>}
                      <Step ctx={ctx} p={p} />
                    </div>
                    <div className="pr">{fromPrice(p)}</div>
                    <div className="nm">{p.name}</div>
                    {low && <div className="lw">{low}</div>}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
        {sections.length === 0 && <p className="empty-note">{needle ? `No encontramos “${q}”.` : 'Todavía no hay artículos publicados.'}</p>}

        <p style={{ textAlign: 'center', color: '#6c706e', fontSize: 12.5, padding: '40px 0 10px' }}>{pricesNote(ctx)} · Hecho con Oplex</p>
      </div>

      {ctx.hud &&
        createPortal(
          <button className={`m-bar${ctx.count > 0 ? ' show' : ''}`} onClick={ctx.openCart} tabIndex={ctx.count > 0 ? 0 : -1}>
            <span className="n">{ctx.count}</span>
            Ver mi pedido
            <span className="t">{money(ctx.total)}</span>
          </button>,
          ctx.hud,
        )}
    </>
  );
}

function View({ ctx, p }: { ctx: StoreCtx; p: StorefrontProduct }) {
  const [v, setV] = useVariant(p);
  const [qty, setQty] = useState(1);
  const low = lowLabel(v?.stockShown);
  const net = netNote(ctx, v);
  const max = v?.stockShown ?? 99;
  return (
    <>
      <div className="scrim" onClick={ctx.close} />
      <div className="pv" role="dialog" aria-modal="true" aria-label={p.name}>
        <button className="x" onClick={ctx.close} aria-label="Cerrar">
          ✕
        </button>
        <SnapGallery p={p} />
        <div className="pvb">
          <h2>{p.name}</h2>
          <div className="pr">{money(v?.price ?? p.price)}</div>
          <div className="lg">
            {priceNote(ctx)}
            {low ? ` · ${low}` : ''}
            {net ? ` · ${net}` : ''}
          </div>
          {p.description && <p>{p.description}</p>}
          <Options
            p={p}
            value={v}
            onChange={(id) => {
              setV(id);
              setQty(1);
            }}
          />
          <p style={{ fontSize: 13 }}>
            {specRows(p, v)
              .filter(([k]) => k !== 'Stock')
              .map(([k, val], i) => (
                <span key={k}>
                  {i > 0 ? ' · ' : ''}
                  <b>{k}:</b> {val}
                </span>
              ))}
          </p>
        </div>
        <div className="foot">
          <div className="qs">
            <button onClick={() => setQty((n) => Math.max(1, n - 1))} aria-label="Menos">
              −
            </button>
            <b>{qty}</b>
            <button onClick={() => setQty((n) => Math.min(max, n + 1))} aria-label="Más">
              +
            </button>
          </div>
          <button
            className="addb"
            onClick={(e) => {
              if (!v) return;
              ctx.add(p, v.id, qty, e.currentTarget);
              ctx.close();
            }}
          >
            <span>Agregar</span>
            <span>{money((v?.price ?? p.price) * qty)}</span>
          </button>
        </div>
      </div>
    </>
  );
}

const Mercado: TemplateModule = { Page, View };
export default Mercado;
