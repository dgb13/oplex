'use client';

import type { StorefrontProduct } from '@/lib/storefront';
import { useEffect, useRef, useState } from 'react';
import {
  fromPrice,
  Gallery,
  inCat,
  lowLabel,
  money,
  netNote,
  Options,
  pad2,
  photo,
  priceNote,
  pricesNote,
  scrollTo,
  specRows,
  useVariant,
  type StoreCtx,
  type TemplateModule,
} from '../shared';

/** 6 · Neón — oscuro y tecnológico: portada con texto que se enciende con
 * el mouse, historia de productos que cambia al bajar, grilla de vidrio. */

function Counter({ to, reduce }: { to: number; reduce: boolean }) {
  const [n, setN] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) {
      setN(to);
      return;
    }
    let step = 0;
    const timer = window.setInterval(() => {
      step++;
      setN(Math.round((to * step) / 30));
      if (step >= 30) window.clearInterval(timer);
    }, 35);
    return () => window.clearInterval(timer);
  }, [to, reduce]);
  return <b>{n}</b>;
}

function Page({ ctx }: { ctx: StoreCtx }) {
  const { store, categories } = ctx;
  const screen = ctx.screen;
  const [cat, setCat] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const hero = useRef<HTMLElement>(null);
  const word = useRef<HTMLDivElement>(null);
  const story = useRef<HTMLDivElement>(null);
  const list = cat ? inCat(ctx, cat) : ctx.featured;
  const feat = ctx.featured.slice(0, 3);
  const fresh = ctx.products.filter((p) => p.isNew).length;
  const title = store.heroTitle || 'Lo nuevo ya llegó';
  // En dos renglones parejos, como "Corré / de noche" del boceto.
  const words = title.trim().split(/\s+/);
  const half = Math.ceil(words.length / 2);
  const titleNode = (
    <>
      {words.slice(0, half).join(' ')}
      {words.length > 1 && (
        <>
          <br />
          {words.slice(half).join(' ')}
        </>
      )}
    </>
  );

  // El producto destacado cambia a medida que se baja.
  useEffect(() => {
    if (!screen || !story.current) return;
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.step));
        }),
      { root: screen, rootMargin: '-45% 0px -45% 0px' },
    );
    story.current.querySelectorAll('[data-step]').forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [screen, feat.length]);

  function onHeroMove(e: React.PointerEvent<HTMLElement>) {
    const h = hero.current;
    const w = word.current;
    if (!h || !w) return;
    const r = h.getBoundingClientRect();
    h.style.setProperty('--mx', `${e.clientX - r.left}px`);
    h.style.setProperty('--my', `${e.clientY - r.top}px`);
    const wr = w.getBoundingClientRect();
    w.style.setProperty('--wx', `${e.clientX - wr.left}px`);
    w.style.setProperty('--wy', `${e.clientY - wr.top}px`);
  }

  function onGlassMove(e: React.PointerEvent<HTMLElement>) {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    c.style.setProperty('--mx', `${x}px`);
    c.style.setProperty('--my', `${y}px`);
    if (!ctx.reduce) c.style.transform = `rotateY(${(x / r.width - 0.5) * 8}deg) rotateX(${-(y / r.height - 0.5) * 8}deg)`;
  }

  return (
    <>
      <header className="n-nav">
        <span className="logo">
          {store.name.toUpperCase()}
          <i />
        </span>
        <nav>
          {feat.length > 1 && (
            <a
              href="#nstory"
              onClick={(e) => {
                e.preventDefault();
                scrollTo(ctx, '#nstory');
              }}
            >
              Destacados
            </a>
          )}
          <a
            href="#ngrid"
            onClick={(e) => {
              e.preventDefault();
              scrollTo(ctx, '#ngrid');
            }}
          >
            Catálogo
          </a>
        </nav>
        <button className="cb" onClick={ctx.openCart}>
          Pedido · <span>{ctx.count}</span>
        </button>
      </header>

      <section className="n-hero" ref={hero} onPointerMove={onHeroMove}>
        {ctx.cover && <img src={ctx.cover} alt={store.name} />}
        <div className="in">
          <div className="k">
            {store.name} · {new Date().getFullYear()}
          </div>
          <div className="n-word" ref={word}>
            <span className="o">{titleNode}</span>
            <span className="f" aria-hidden="true">
              {titleNode}
            </span>
          </div>
          <p className="sub">{store.heroSubtitle || 'Stock en tiempo real y pedido en un minuto.'}</p>
          <div className="n-stats">
            <div>
              <Counter to={ctx.products.length} reduce={ctx.reduce} />
              <span>productos</span>
            </div>
            <div>
              <Counter to={categories.length} reduce={ctx.reduce} />
              <span>categorías</span>
            </div>
            {fresh > 0 && (
              <div>
                <Counter to={fresh} reduce={ctx.reduce} />
                <span>nuevos</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {feat.length > 1 && (
        <section className="n-story" id="nstory">
          <div className="n-stick">
            <div className="n-frame">
              {feat.map((p, i) => (
                <img key={p.id} src={photo(p)} alt={p.name} className={i === step ? 'on' : ''} />
              ))}
              <span className="ix">
                {pad2(step + 1)} / {pad2(feat.length)}
              </span>
            </div>
          </div>
          <div className="n-steps" ref={story}>
            {feat.map((p, i) => (
              <div className={`n-step${i === step ? ' on' : ''}`} data-step={i} key={p.id}>
                <span className="i">
                  {pad2(i + 1)} — {p.category}
                </span>
                <h3>{p.name}</h3>
                {p.description && <p>{p.description}</p>}
                <div className="row">
                  <span className="pr">{fromPrice(p)}</span>
                  <button className="n-btn" onClick={(e) => ctx.add(p, undefined, 1, e.currentTarget)}>
                    Agregar
                  </button>
                  <button className="n-btn" onClick={() => ctx.open(p.id)}>
                    Ver
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="n-gh" id="ngrid">
        <h2>Todo el catálogo</h2>
        <div className="f">
          <button aria-pressed={!cat} onClick={() => setCat(null)}>
            Todo
          </button>
          {categories.map((c) => (
            <button key={c} aria-pressed={cat === c} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <section className="n-grid">
        {list.map((p) => {
          const low = lowLabel(p.stockShown);
          return (
            <article
              className="n-c"
              key={p.id}
              onClick={() => ctx.open(p.id)}
              onPointerMove={onGlassMove}
              onPointerLeave={(e) => {
                e.currentTarget.style.transform = '';
              }}
            >
              <div className="im">
                <img src={photo(p)} alt={p.name} loading="lazy" />
              </div>
              <h3>{p.name}</h3>
              <div className="cat">
                {p.category}
                {low ? ` · ${low}` : ''}
              </div>
              <div className="rw" style={{ marginTop: 8 }}>
                <span className="pr">{fromPrice(p)}</span>
                <button
                  className="ad"
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

      <footer className="n-foot">
        <span>{[store.name.toUpperCase(), store.address].filter(Boolean).join(' · ')}</span>
        <span>{pricesNote(ctx)} · Hecho con Oplex</span>
      </footer>
    </>
  );
}

function View({ ctx, p }: { ctx: StoreCtx; p: StorefrontProduct }) {
  const [v, setV] = useVariant(p);
  const low = lowLabel(v?.stockShown);
  const net = netNote(ctx, v);
  return (
    <div className="pv" role="dialog" aria-modal="true" aria-label={p.name}>
      <button className="x" onClick={ctx.close} aria-label="Cerrar">
        ✕
      </button>
      <Gallery p={p} />
      <div className="bx">
        <span className="k">
          {p.category}
          {p.sku ? ` · ${p.sku}` : ''}
        </span>
        <h2>{p.name}</h2>
        <span className="pr">{money(v?.price ?? p.price)}</span>
        {p.description && <p>{p.description}</p>}
        <div className="specs">
          {specRows(p, v)
            .filter(([k]) => k !== 'Categoría')
            .map(([k, val]) => (
              <span key={k}>
                {k}: {val}
              </span>
            ))}
        </div>
        <Options p={p} value={v} onChange={setV} />
        <button className="addb" onClick={(e) => v && ctx.add(p, v.id, 1, e.currentTarget)}>
          Agregar al pedido
        </button>
        <span style={{ fontSize: 12, color: '#8b90b0' }}>
          {priceNote(ctx)}
          {low ? ` · ${low}` : ''}
          {net ? ` · ${net}` : ''}
        </span>
      </div>
    </div>
  );
}

const Neon: TemplateModule = { Page, View };
export default Neon;
