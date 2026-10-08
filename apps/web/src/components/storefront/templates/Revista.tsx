'use client';

import type { StorefrontProduct } from '@/lib/storefront';
import {
  fitSize,
  fromPrice,
  Gallery,
  inCat,
  lowLabel,
  money,
  MONTHS,
  netNote,
  Options,
  pad2,
  photo,
  priceNote,
  pricesNote,
  scrollTo,
  SpecsDl,
  useVariant,
  type StoreCtx,
  type TemplateModule,
} from '../shared';

/** 7 · Revista — editorial: cabezal gigante, tapa en collage, índice de
 * secciones, artículos con diagramación distinta y ficha tipo nota. */

// Cómo se diagrama cada sección (se van turnando).
const LAYOUTS = [
  ['f-hero', 'f-tall'],
  ['f-third', 'f-third', 'f-third'],
  ['f-wide', 'f-side'],
  ['f-half', 'f-half'],
];
const QUOTES = ['«Menos cosas, mejor elegidas.»', '«Lo bueno se elige con tiempo.»', '«Todo lo que ves está en stock.»'];

const secId = (ctx: StoreCtx, c: string) => `rs-${ctx.categories.indexOf(c)}`;

/** Título con la última palabra en itálica. */
function lastItalic(text: string) {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return text;
  return (
    <>
      {words.slice(0, -1).join(' ')} <em>{words[words.length - 1]}</em>
    </>
  );
}

function Page({ ctx }: { ctx: StoreCtx }) {
  const { store, categories } = ctx;
  const now = new Date();
  const secs = categories.filter((c) => inCat(ctx, c).length > 0);
  const lead = ctx.featured[0];
  const mast = store.name.toUpperCase();
  let fig = 0;

  return (
    <>
      <div className="r-top">
        <span>
          Edición {MONTHS[now.getMonth()]} {now.getFullYear()}
        </span>
        {store.address && <span className="d">{store.address}</span>}
        <button onClick={ctx.openCart}>Pedido ({ctx.count})</button>
      </div>
      <h1 className="r-mast" style={{ fontSize: `max(56px, ${fitSize(mast, 160, 30)})` }}>
        {[...mast].map((ch, i) => (
          <span key={i} style={{ animationDelay: `${i * 0.06}s` }}>
            {ch === ' ' ? '\u00a0' : ch}
          </span>
        ))}
      </h1>
      <nav className="r-nav">
        {secs.map((c) => (
          <button key={c} onClick={() => scrollTo(ctx, `#${secId(ctx, c)}`)}>
            {c}
          </button>
        ))}
      </nav>

      <section className="r-cover">
        <figure className="big">
          {ctx.cover && <img src={ctx.cover} alt={store.name} />}
          <figcaption>En la tapa: lo nuevo de {store.name}.</figcaption>
          {lead && (
            <div className="ov" onClick={() => ctx.open(lead.id)}>
              <img src={photo(lead)} alt={lead.name} />
              <p>
                <b>{lead.name}</b>
                <span>{money(lead.price)}</span>
              </p>
            </div>
          )}
        </figure>
        <div className="side">
          <span className="r-kick">Nota de tapa</span>
          <h1>{lastItalic(store.heroTitle || 'Lo nuevo de la temporada')}</h1>
          <p className="deck">
            {store.heroSubtitle ||
              `${categories.slice(0, 3).join(', ')}${categories.length > 3 ? ' y más' : ''}: ${ctx.products.length} productos con stock real y precio claro.`}
          </p>
          <button className="r-kick" style={{ textAlign: 'left' }} onClick={() => scrollTo(ctx, '#rtoc')}>
            Leer la edición →
          </button>
          <div className="by">
            Por {store.name} · {ctx.products.length} productos
          </div>
        </div>
      </section>

      <section className="r-toc" id="rtoc">
        <h2>
          En
          <br />
          esta
          <br />
          edición
        </h2>
        {secs.map((c, i) => (
          <button key={c} onClick={() => scrollTo(ctx, `#${secId(ctx, c)}`)}>
            <i>{pad2(i + 1)}</i>
            {c}
            <span>{inCat(ctx, c).length} art.</span>
          </button>
        ))}
      </section>

      {secs.map((c, si) => {
        const items = inCat(ctx, c);
        const lay = LAYOUTS[si % LAYOUTS.length];
        const texts = items.map((p) => p.description).filter(Boolean);
        return (
          <section className="r-sec" id={secId(ctx, c)} key={c}>
            <div className="r-sh">
              <span className="num">{pad2(si + 1)}</span>
              <h2>{c}</h2>
              <p>
                {items.length} {items.length === 1 ? 'pieza elegida' : 'piezas elegidas'} por {store.name}. {pricesNote(ctx)}.
              </p>
            </div>
            <div className="r-lay">
              {items.map((p, k) => {
                fig++;
                const cls = items.length === 1 ? 'f-wide' : (lay[k] ?? 'f-third');
                return (
                  <figure className={`r-fig ${cls}`} data-rv key={p.id} onClick={() => ctx.open(p.id)}>
                    <div className="im">
                      <img src={photo(p)} alt={p.name} loading="lazy" />
                    </div>
                    <figcaption className="cap">
                      <span>
                        <b>Fig. {fig}.</b> {p.name}. <i>{p.variants.length > 1 ? `${p.variants.length} opciones` : p.sku}</i>
                      </span>
                      <span className="pr">{fromPrice(p)}</span>
                    </figcaption>
                    <button
                      className="add"
                      onClick={(e) => {
                        e.stopPropagation();
                        ctx.add(p, undefined, 1, e.currentTarget);
                      }}
                    >
                      Agregar al pedido
                    </button>
                  </figure>
                );
              })}
              {items.length === 1 && (
                <p className="r-quote" data-rv>
                  {QUOTES[si % QUOTES.length]}
                  <small>— {store.name}</small>
                </p>
              )}
              {items.length === 2 && lay[0] === 'f-half' && texts.length > 0 && (
                <div className="r-body" style={{ gridColumn: 'span 12' }}>
                  {texts.join(' ')}
                </div>
              )}
            </div>
          </section>
        );
      })}
      {secs.length === 0 && <p className="empty-note">Todavía no hay artículos publicados.</p>}

      <footer className="r-foot">
        <b>{mast}</b>
        <span>{[store.address, store.whatsappNumber ? 'Pedidos por WhatsApp' : null, 'Hecho con Oplex'].filter(Boolean).join(' · ')}</span>
      </footer>
    </>
  );
}

/** La primera oración de la descripción va de bajada; el resto, de texto. */
function splitDescription(text: string | null): [string, string] {
  if (!text) return ['', ''];
  const m = /^(.+?[.!?])\s+(.+)$/s.exec(text.trim());
  return m ? [m[1], m[2]] : [text.trim(), ''];
}

function View({ ctx, p }: { ctx: StoreCtx; p: StorefrontProduct }) {
  const [v, setV] = useVariant(p);
  const [deck, rest] = splitDescription(p.description);
  const net = netNote(ctx, v);
  return (
    <div className="pv" role="dialog" aria-modal="true" aria-label={p.name}>
      <div className="pvt">
        <button onClick={ctx.close}>← Volver a la edición</button>
        <span>
          {p.category}
          {p.sku ? ` · ${p.sku}` : ''}
        </span>
        <button onClick={ctx.openCart}>Pedido ({ctx.count})</button>
      </div>
      <article className="art">
        <header>
          <div>
            <span style={{ color: 'var(--r)', fontSize: 11.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase' }}>{p.category}</span>
            <h2>{p.name}</h2>
          </div>
          <p className="deck">{deck || `${p.category}. ${priceNote(ctx)}.`}</p>
        </header>
        <Gallery p={p} />
        <aside>
          <div className="box">
            <div className="pr">{money(v?.price ?? p.price)}</div>
            <div className="lg">
              {priceNote(ctx)} · {lowLabel(v?.stockShown) || 'En stock'}
              {net && (
                <>
                  <br />
                  {net}
                </>
              )}
            </div>
            <Options p={p} value={v} onChange={setV} />
            <button className="addb" onClick={(e) => v && ctx.add(p, v.id, 1, e.currentTarget)}>
              Agregar al pedido
            </button>
          </div>
          {rest && <p className="txt">{rest}</p>}
          <SpecsDl p={p} v={v} />
        </aside>
      </article>
    </div>
  );
}

const Revista: TemplateModule = { Page, View };
export default Revista;
