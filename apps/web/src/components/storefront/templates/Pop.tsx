'use client';

import type { StorefrontProduct } from '@/lib/storefront';
import { useState } from 'react';
import {
  CartIcon,
  createPortal,
  fitSize,
  fromPrice,
  inCat,
  lowLabel,
  money,
  netNote,
  Options,
  photo,
  priceNote,
  scrollTo,
  SnapGallery,
  useVariant,
  type StoreCtx,
  type TemplateModule,
} from '../shared';

/** 3 · Pop — stickers y color: nav en píldora, título que rebota, muro de
 * tarjetas de alturas distintas, ficha que sube desde abajo, burbuja. */

const COLORS = ['#7fb2ff', '#ff8a6b', '#9be27a', '#ff9cc6', '#ffe066', '#6fe3e6', '#c9a4ff'];
const ROT = [-1.6, 1.2, -0.6, 1.8, -1.1, 0.7];
// [left, top, giro] de cada sticker de la portada.
const STICKERS: [string, string, number][] = [
  ['5%', '10%', -8],
  ['85%', '4%', 10],
  ['3%', '60%', 6],
  ['86%', '56%', -10],
  ['68%', '76%', 8],
];

function colorOf(ctx: StoreCtx, c: string): string {
  const i = ctx.categories.indexOf(c);
  return COLORS[(i < 0 ? 0 : i) % COLORS.length];
}

function Title({ text }: { text: string }) {
  const words = text.toUpperCase().trim().split(/\s+/);
  let n = 0;
  return (
    <h1>
      {words.map((w, wi) => (
        <em key={wi} style={{ fontStyle: 'normal', whiteSpace: 'nowrap' }}>
          {[...w].map((ch, k) => (
            <span key={k} className={wi === words.length - 1 && words.length > 1 ? 'o' : ''} style={{ animationDelay: `${n++ * 0.05}s` }}>
              {ch}
            </span>
          ))}
          {wi < words.length - 1 && (words.length <= 3 ? <br /> : ' ')}
        </em>
      ))}
    </h1>
  );
}

function Page({ ctx }: { ctx: StoreCtx }) {
  const { store, categories } = ctx;
  const [cat, setCat] = useState<string | null>(null);
  const list = cat ? inCat(ctx, cat) : ctx.featured;
  const pick = (c: string | null) => {
    setCat(c);
    scrollTo(ctx, '#pwall');
  };
  const tapeA = ['STOCK REAL', 'PRECIO FINAL', store.whatsappNumber ? 'PEDIDO POR WHATSAPP' : 'PEDIDO ONLINE', ...(store.address ? [store.address.toUpperCase()] : [])].join(' ✺ ') + ' ✺ ';
  const tapeB = (categories.length > 0 ? categories : [store.name]).map((c) => c.toUpperCase()).join(' ★ ') + ' ★ ';

  return (
    <>
      <nav className="p-nav">
        <span className="logo">{store.name.toLowerCase()}!</span>
        <div className="ln">
          <button aria-pressed={!cat} onClick={() => pick(null)}>
            Todo
          </button>
          {categories.slice(0, 4).map((c) => (
            <button key={c} aria-pressed={cat === c} onClick={() => pick(c)}>
              {c}
            </button>
          ))}
        </div>
      </nav>

      <section className="p-hero">
        {ctx.featured.slice(0, STICKERS.length).map((p, i) => {
          const [x, y, r] = STICKERS[i];
          return (
            <div
              key={p.id}
              className="p-stk"
              style={{ left: x, top: y, transform: `rotate(${r}deg)`, animationDelay: `${i * -0.8}s`, ['--r2' as string]: `${-r}deg` }}
            >
              <img src={photo(p)} alt="" />
            </div>
          );
        })}
        <div className="p-badge" style={{ left: '20%', top: '6%' }}>
          STOCK
          <br />
          REAL
          <br />✓
        </div>
        <div>
          <Title text={store.heroTitle || '¡Llegó lo nuevo!'} />
          <p className="lead">
            {store.heroSubtitle || `Precios claros y stock real. Armá tu pedido en dos toques y te lo confirmamos${store.whatsappNumber ? ' por WhatsApp' : ''}.`}
          </p>
          <div className="cta">
            <button className="p-btn" onClick={() => scrollTo(ctx, '#pwall')}>
              ¡Quiero ver todo! ↓
            </button>
          </div>
        </div>
      </section>

      <div className="p-tape" aria-hidden>
        <div>{tapeA.repeat(4)}</div>
      </div>
      <div className="p-tape b" aria-hidden>
        <div>{tapeB.repeat(Math.max(3, Math.ceil(12 / Math.max(1, categories.length))))}</div>
      </div>

      {categories.length > 1 && (
        <section className="p-cats" style={{ ['--n' as string]: Math.min(7, Math.max(4, categories.length)) }}>
          {categories.map((c) => (
            <button key={c} className="p-cat" style={{ background: colorOf(ctx, c) }} aria-pressed={cat === c} onClick={() => pick(c)}>
              <span className="im">
                <img src={photo(inCat(ctx, c)[0])} alt="" />
              </span>
              {c}
              <small>
                {inCat(ctx, c).length} {inCat(ctx, c).length === 1 ? 'cosa' : 'cosas'}
              </small>
            </button>
          ))}
        </section>
      )}

      <section className="p-wall" id="pwall">
        {list.map((p, i) => {
          const low = lowLabel(p.stockShown);
          return (
            <article
              key={p.id}
              className="p-card"
              style={{ background: colorOf(ctx, p.category), ['--rot' as string]: `${ROT[i % ROT.length]}deg` }}
              onClick={() => ctx.open(p.id)}
            >
              <div className="ph">
                <img src={photo(p)} alt={p.name} loading="lazy" />
              </div>
              {low && <span className="low">¡{low}!</span>}
              <span className="pr">{fromPrice(p)}</span>
              <h3>{p.name}</h3>
              <div className="row">
                <span className="cat">{p.category}</span>
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
        {list.length === 0 && <p className="empty-note">Todavía no hay artículos publicados.</p>}
      </section>

      <footer className="p-foot">
        <b style={{ fontSize: `clamp(48px, ${fitSize(store.name, 80, 12)}, 170px)` }}>{store.name.toLowerCase()}!</b>
        <span>{[store.address, store.whatsappNumber ? 'Pedidos por WhatsApp' : null, 'Hecho con Oplex'].filter(Boolean).join(' · ')}</span>
      </footer>

      {ctx.hud &&
        createPortal(
          <button className="p-bubble" onClick={ctx.openCart} aria-label="Ver pedido">
            <CartIcon />
            <span>{ctx.count}</span>
          </button>,
          ctx.hud,
        )}
    </>
  );
}

function View({ ctx, p }: { ctx: StoreCtx; p: StorefrontProduct }) {
  const [v, setV] = useVariant(p);
  const low = lowLabel(v?.stockShown);
  const net = netNote(ctx, v);
  const color = colorOf(ctx, p.category);
  return (
    <>
      <div className="scrim" onClick={ctx.close} />
      <div className="pv" role="dialog" aria-modal="true" aria-label={p.name}>
        <div className="grab" />
        <button className="x" onClick={ctx.close} aria-label="Cerrar">
          ✕
        </button>
        <div className="pvi">
          <div>
            <div className="hd" style={{ background: color }}>
              <SnapGallery p={p} />
            </div>
          </div>
          <div className="bx">
            <span style={{ background: color, border: '2.5px solid #141414', borderRadius: 999, padding: '4px 12px', fontWeight: 700 }}>{p.category}</span>
            <h2>{p.name}</h2>
            <span className="pr">{money(v?.price ?? p.price)}</span>
            {p.description && <p>{p.description}</p>}
            <Options p={p} value={v} onChange={setV} />
            <button className="p-btn" onClick={(e) => v && ctx.add(p, v.id, 1, e.currentTarget)}>
              ¡Lo quiero! +
            </button>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {low ? `${low} · ` : ''}
              {priceNote(ctx)}
              {net ? ` · ${net}` : ''}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

const Pop: TemplateModule = { Page, View };
export default Pop;
