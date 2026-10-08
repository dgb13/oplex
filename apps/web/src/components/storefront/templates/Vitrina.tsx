'use client';

import type { StorefrontProduct } from '@/lib/storefront';
import { useEffect, useRef, useState } from 'react';
import {
  createPortal,
  fromPrice,
  Gallery,
  lowLabel,
  money,
  netNote,
  Options,
  pad2,
  photo,
  photos,
  priceNote,
  useVariant,
  type StoreCtx,
  type TemplateModule,
} from '../shared';

/** 8 · Vitrina — pantalla completa: un producto a la vez, se pasa con
 * flechas/rueda/deslizar, cortina entre productos, índice con vista previa. */

// Fondo de cada pantalla (en el boceto, el tono de cada producto).
const TONES = ['#2c2b2a', '#b8541c', '#2a2c30', '#3d4247', '#8a5a4a', '#24262c', '#6c2f96', '#a8492a', '#55604f', '#3f4449', '#2f6b2c', '#a34a1d', '#23324f', '#1f3f6e', '#1c1d20', '#14161a'];

function Words({ text, gap }: { text: string; gap: number }) {
  const words = text.split(/\s+/);
  return (
    <>
      {words.map((w, k) => (
        <span key={k}>
          <span className="w">
            <span style={{ ['--d' as string]: `${k * gap}s` }}>{w}</span>
          </span>
          {k < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  );
}

function Page({ ctx }: { ctx: StoreCtx }) {
  const { store } = ctx;
  const screen = ctx.screen;
  const list = ctx.featured;
  const last = list.length;
  const slide = Math.min(ctx.slide, last);
  // Para la cortina: cuál se está yendo y desde qué lado entra la nueva.
  const [view, setView] = useState({ cur: slide, was: -1, ox: '92%' });
  if (view.cur !== slide) setView({ cur: slide, was: view.cur, ox: slide > view.cur ? '92%' : '8%' });
  const rail = useRef<HTMLDivElement>(null);
  const go = (i: number) => ctx.setSlide(Math.max(0, Math.min(last, i)));
  const goRef = useRef(go);
  goRef.current = go;
  const slideRef = useRef(slide);
  slideRef.current = slide;

  // Rueda, deslizar y flechas del teclado.
  useEffect(() => {
    if (!screen) return;
    let lock = 0;
    let x0: number | null = null;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lock < 900 || Math.abs(e.deltaY) < 14) return;
      lock = now;
      goRef.current(slideRef.current + (e.deltaY > 0 ? 1 : -1));
    };
    const onDown = (e: PointerEvent) => {
      x0 = e.clientX;
    };
    const onUp = (e: PointerEvent) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 50) goRef.current(slideRef.current + (dx < 0 ? 1 : -1));
    };
    screen.addEventListener('wheel', onWheel, { passive: false });
    screen.addEventListener('pointerdown', onDown);
    screen.addEventListener('pointerup', onUp);
    return () => {
      screen.removeEventListener('wheel', onWheel);
      screen.removeEventListener('pointerdown', onDown);
      screen.removeEventListener('pointerup', onUp);
    };
  }, [screen]);

  useEffect(() => {
    if (ctx.layerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goRef.current(slideRef.current + 1);
      if (e.key === 'ArrowLeft') goRef.current(slideRef.current - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctx.layerOpen]);

  useEffect(() => {
    rail.current?.children[slide]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: ctx.reduce ? 'auto' : 'smooth' });
  }, [slide, ctx.reduce]);

  const cls = (i: number) => `v-slide${i === 0 ? ' v-intro' : ''}${i === slide ? ' on' : i === view.was ? ' was' : ''}`;
  // Sólo se cargan las fotos de las pantallas cercanas.
  const near = (i: number) => Math.abs(i - slide) <= 2 || i === view.was;

  return (
    <>
      <section className={cls(0)} style={{ ['--bgc' as string]: '#111', ['--ox' as string]: view.ox }}>
        <div className="v-ph">{ctx.cover && <img src={ctx.cover} alt={store.name} />}</div>
        <div className="v-txt">
          <span className="k">
            {store.name} · {last} {last === 1 ? 'pieza' : 'piezas'}
          </span>
          <h2>
            <Words text={store.heroTitle || 'Una pieza a la vez.'} gap={0.07} />
          </h2>
          <p className="ds">{store.heroSubtitle || 'Pasá con las flechas, deslizando o con la rueda.'}</p>
          <div className="rw">
            {last > 0 && (
              <button className="v-btn" onClick={() => go(1)}>
                Empezar →
              </button>
            )}
            <button className="v-ghost" onClick={ctx.openMenu}>
              Ver el índice
            </button>
          </div>
        </div>
      </section>
      {list.map((p, k) => {
        const i = k + 1;
        const n = photos(p).length;
        const low = lowLabel(p.stockShown);
        return (
          <section key={p.id} className={cls(i)} style={{ ['--bgc' as string]: TONES[k % TONES.length], ['--ox' as string]: view.ox }} aria-hidden={i !== slide}>
            <div className="v-txt">
              <span className="k">
                {pad2(i)} / {pad2(last)} · {p.category}
              </span>
              <h2>
                <Words text={p.name} gap={0.06} />
              </h2>
              {p.description && <p className="ds">{p.description}</p>}
              <div className="rw">
                <span className="pr">{fromPrice(p)}</span>
                <button className="v-btn" onClick={(e) => ctx.add(p, undefined, 1, e.currentTarget)}>
                  {p.variants.length > 1 ? 'Elegir opción' : 'Agregar al pedido'}
                </button>
                <button className="v-ghost" onClick={() => ctx.open(p.id)}>
                  Ver {n} foto{n > 1 ? 's' : ''}
                </button>
              </div>
              <span className="k" style={{ opacity: 0.9 }}>
                {low ? `${low} · ` : ''}
                {priceNote(ctx)}
              </span>
            </div>
            <div className="v-ph">{near(i) && <img src={photo(p)} alt={p.name} />}</div>
          </section>
        );
      })}

      {ctx.hud &&
        createPortal(
          <div className="v-ui">
            <div className="v-top">
              <span className="logo">{store.name.toUpperCase()}</span>
              <div className="r">
                <button onClick={ctx.openMenu}>Índice</button>
                <button onClick={ctx.openCart}>Pedido ({ctx.count})</button>
              </div>
            </div>
            <div className="v-prog">
              <span>{pad2(slide)}</span>
              <div className="tr">
                <i style={{ height: `${last ? (slide / last) * 100 : 0}%` }} />
              </div>
              <span>{pad2(last)}</span>
            </div>
            <div className="v-arr">
              <button onClick={() => go(slide - 1)} aria-label="Anterior">
                ←
              </button>
              <button onClick={() => go(slide + 1)} aria-label="Siguiente">
                →
              </button>
            </div>
            {slide === 0 && last > 0 && <span className="v-hint">Deslizá o usá las flechas</span>}
            <div className="v-rail" ref={rail}>
              <button className={`intro${slide === 0 ? ' on' : ''}`} onClick={() => go(0)} aria-label="Inicio">
                INICIO
              </button>
              {list.map((p, k) => (
                <button key={p.id} className={slide === k + 1 ? 'on' : ''} onClick={() => go(k + 1)} aria-label={p.name}>
                  <img src={photo(p)} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </div>,
          ctx.hud,
        )}
    </>
  );
}

function Menu({ ctx }: { ctx: StoreCtx }) {
  const [preview, setPreview] = useState<{ src: string; x: number; y: number; on: boolean }>({ src: '', x: 0, y: 0, on: false });
  return (
    <div
      className="menu"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - r.left + 24;
        const y = e.clientY - r.top - 120;
        setPreview((s) => ({ ...s, x, y }));
      }}
    >
      <button className="x" onClick={ctx.close}>
        Cerrar ×
      </button>
      <ol>
        {ctx.featured.map((p, i) => (
          <li key={p.id} onPointerEnter={() => setPreview((s) => ({ ...s, src: photo(p), on: true }))} onPointerLeave={() => setPreview((s) => ({ ...s, on: false }))}>
            <button
              onClick={() => {
                ctx.close();
                ctx.setSlide(i + 1);
              }}
            >
              {p.name}
              <span>{fromPrice(p)}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className={`float${preview.on ? ' on' : ''}`} style={{ left: preview.x, top: preview.y }}>
        {preview.src && <img src={preview.src} alt="" />}
      </div>
    </div>
  );
}

function View({ ctx, p }: { ctx: StoreCtx; p: StorefrontProduct }) {
  const [v, setV] = useVariant(p);
  const net = netNote(ctx, v);
  return (
    <div className="gal" role="dialog" aria-modal="true" aria-label={p.name}>
      <button className="x" onClick={ctx.close}>
        Cerrar ×
      </button>
      <Gallery p={p} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, color: '#fff', fontFamily: "'Syne',sans-serif", flexWrap: 'wrap' }}>
        <div>
          <b style={{ fontSize: 20, textTransform: 'uppercase' }}>{p.name}</b>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, opacity: 0.7 }}>
            {priceNote(ctx)}
            {net ? ` · ${net}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontFamily: "'DM Sans',sans-serif" }}>
          <Options p={p} value={v} onChange={setV} cls="vopt" />
          <button className="v-btn" onClick={(e) => v && ctx.add(p, v.id, 1, e.currentTarget)}>
            Agregar · {money(v?.price ?? p.price)}
          </button>
        </div>
      </div>
    </div>
  );
}

const Vitrina: TemplateModule = { Page, View, Menu, locked: true };
export default Vitrina;
