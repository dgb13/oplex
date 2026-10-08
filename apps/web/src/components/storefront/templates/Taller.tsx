'use client';

import type { StorefrontProduct } from '@/lib/storefront';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  cartLines,
  fromPrice,
  Gallery,
  money,
  netNote,
  Options,
  pad2,
  photo,
  priceNote,
  pricesNote,
  specRows,
  uploadUrl,
  useVariant,
  type StoreCtx,
  type TemplateModule,
} from '../shared';

/** 4 · Taller — catálogo técnico: buscador grande, filtros al costado,
 * vista lista/grilla, pedido fijo a la derecha, ficha con especificaciones. */

type Sort = 'rel' | 'asc' | 'desc' | 'stock';

function StockBars({ p }: { p: StorefrontProduct }) {
  const s = p.stockShown;
  const filled = s == null ? 5 : Math.min(5, Math.ceil(s / 6));
  const low = s != null && s <= 5;
  return (
    <div className={`w-stock${low ? ' low' : ''}`}>
      <div className="bars">
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} className={i < filled ? 'f' : ''} />
        ))}
      </div>
      {s == null ? 'En stock' : low ? `Quedan ${s}` : `Stock ${pad2(s)}`}
    </div>
  );
}

function niceStep(range: number): number {
  const raw = Math.max(1, range / 40);
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
}

function Page({ ctx }: { ctx: StoreCtx }) {
  const { store, categories, products } = ctx;
  const bounds = useMemo(() => {
    const prices = products.map((p) => p.price);
    const lo = prices.length ? Math.min(...prices) : 0;
    const hi = prices.length ? Math.max(...prices) : 0;
    const step = niceStep(hi - lo);
    return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step };
  }, [products]);

  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [max, setMax] = useState<number | null>(null);
  const [onlyStock, setOnlyStock] = useState(false);
  const [sort, setSort] = useState<Sort>('rel');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [qty, setQty] = useState<Record<string, number>>({});
  const search = useRef<HTMLInputElement>(null);
  const order = useRef<HTMLElement>(null);
  const firstCount = useRef(ctx.count);
  const limit = max ?? bounds.max;

  // "/" lleva al buscador, como en los catálogos de repuestos.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || ctx.layerOpen) return;
      const target = e.target as HTMLElement;
      if (target.closest('input,textarea,select')) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctx.layerOpen]);

  // El pedido de la derecha parpadea cuando entra algo.
  useEffect(() => {
    if (ctx.count === firstCount.current) return;
    firstCount.current = ctx.count;
    const el = order.current;
    if (!el) return;
    el.classList.remove('w-flash');
    void el.offsetWidth;
    el.classList.add('w-flash');
  }, [ctx.count]);

  let list = ctx.featured.filter((p) => (!cat || p.category === cat) && p.price <= limit && (!onlyStock || p.stockShown == null || p.stockShown > 5));
  const needle = q.trim().toLowerCase();
  if (needle) list = list.filter((p) => `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(needle));
  if (sort === 'asc') list = [...list].sort((a, b) => a.price - b.price);
  if (sort === 'desc') list = [...list].sort((a, b) => b.price - a.price);
  if (sort === 'stock') list = [...list].sort((a, b) => (b.stockShown ?? 999) - (a.stockShown ?? 999));

  const count = (c: string) => products.filter((p) => p.category === c).length;
  const lines = cartLines(ctx.cart, products);
  const qtyOf = (id: string) => qty[id] ?? 1;
  const addRow = (p: StorefrontProduct, el: HTMLElement) => {
    ctx.add(p, p.variants.length > 1 ? undefined : p.variants[0]?.id, qtyOf(p.id), el);
    setQty((s) => ({ ...s, [p.id]: 1 }));
  };

  let rows: React.ReactNode;
  if (list.length === 0) {
    rows = (
      <p style={{ padding: '30px 0', fontFamily: "'IBM Plex Mono',monospace" }}>
        {needle ? `Sin resultados para “${q}”. Probá con otro nombre o código.` : 'No hay artículos con estos filtros.'}
      </p>
    );
  } else if (view === 'grid') {
    rows = (
      <div className="w-grid">
        {list.map((p) => (
          <div className="w-c" key={p.id}>
            <div className="im" onClick={() => ctx.open(p.id)}>
              <img src={photo(p)} alt={p.name} loading="lazy" />
            </div>
            <span className="cd" style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: '#676761' }}>
              {p.sku}
            </span>
            <h3 onClick={() => ctx.open(p.id)} style={{ cursor: 'pointer' }}>
              {p.name}
            </h3>
            <StockBars p={p} />
            <div className="bt">
              <span className="pr">{fromPrice(p)}</span>
              <button className="w-add" style={{ borderLeft: '1px solid #121212' }} onClick={(e) => addRow(p, e.currentTarget)}>
                {p.variants.length > 1 ? 'Elegir' : '+ Agregar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  } else {
    rows = (
      <div className="w-list">
        {list.map((p) => (
          <div className="w-r" key={p.id}>
            <div className="im" onClick={() => ctx.open(p.id)}>
              <img src={photo(p)} alt={p.name} loading="lazy" />
            </div>
            <div>
              <div className="cd">
                {p.sku ? `${p.sku} · ` : ''}
                {p.category}
              </div>
              <h3 onClick={() => ctx.open(p.id)}>{p.name}</h3>
            </div>
            <div className="sp">{p.variants.length > 1 && p.variants.slice(0, 3).map((v) => <span key={v.id}>{v.label}</span>)}</div>
            <StockBars p={p} />
            <div className="w-buy">
              <span className="pr">{fromPrice(p)}</span>
              <div className="ctl">
                {p.variants.length === 1 && (
                  <div className="w-q">
                    <button onClick={() => setQty((s) => ({ ...s, [p.id]: Math.max(1, qtyOf(p.id) - 1) }))} aria-label="Menos">
                      −
                    </button>
                    <input
                      value={qtyOf(p.id)}
                      inputMode="numeric"
                      aria-label="Cantidad"
                      onChange={(e) => setQty((s) => ({ ...s, [p.id]: Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)) }))}
                    />
                    <button onClick={() => setQty((s) => ({ ...s, [p.id]: Math.min(99, qtyOf(p.id) + 1) }))} aria-label="Más">
                      +
                    </button>
                  </div>
                )}
                <button className="w-add" style={p.variants.length > 1 ? { borderLeft: '1px solid #121212' } : undefined} onClick={(e) => addRow(p, e.currentTarget)}>
                  {p.variants.length > 1 ? 'Elegir opción' : 'Agregar'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="w-util">
        <span className="live">Stock al día</span>
        {store.address && <span className="h">{store.address}</span>}
        {store.whatsappNumber && <span className="h">Pedidos por WhatsApp {store.whatsappNumber}</span>}
        <span>
          Precios <b>{pricesNote(ctx).replace('Precios ', '')}</b>
        </span>
      </div>
      <header className="w-head">
        <div className="w-logo">
          {store.logoUrl ? <img src={uploadUrl(store.logoUrl)} alt={store.name} style={{ height: 34, width: 'auto' }} /> : store.name}
          <small>{(store.heroTitle || 'Catálogo en línea').toUpperCase()}</small>
        </div>
        <label className="w-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscá por nombre, código o categoría" aria-label="Buscar" />
          <kbd>/</kbd>
        </label>
        <button className="w-cartb" onClick={ctx.openCart}>
          Pedido <span>{ctx.count}</span>
        </button>
      </header>
      <div className="w-tabs">
        <button aria-pressed={!cat} onClick={() => setCat(null)}>
          Todo<sup>{products.length}</sup>
        </button>
        {categories.map((c) => (
          <button key={c} aria-pressed={cat === c} onClick={() => setCat(c)}>
            {c}
            <sup>{count(c)}</sup>
          </button>
        ))}
      </div>
      <div className="w-body">
        <aside className="w-side">
          <div>
            <h4>Categoría</h4>
            {categories.map((c) => (
              <label key={c}>
                <input type="radio" name="wc" checked={cat === c} onChange={() => setCat(c)} /> {c}
                <span>{count(c)}</span>
              </label>
            ))}
            <label>
              <input type="radio" name="wc" checked={!cat} onChange={() => setCat(null)} /> Todas<span>{products.length}</span>
            </label>
          </div>
          {bounds.max > bounds.min && (
            <div>
              <h4>Precio máximo</h4>
              <input
                type="range"
                min={bounds.min}
                max={bounds.max}
                step={bounds.step}
                value={limit}
                onChange={(e) => setMax(Number(e.target.value))}
                aria-label="Precio máximo"
              />
              <div className="rg">
                <span>{money(bounds.min)}</span>
                <span>{money(limit)}</span>
              </div>
            </div>
          )}
          <div>
            <h4>Disponibilidad</h4>
            <label>
              <input type="checkbox" checked={onlyStock} onChange={(e) => setOnlyStock(e.target.checked)} /> Más de 5 en stock
            </label>
          </div>
        </aside>
        <main className="w-main">
          <div className="w-tool">
            <span className="n">
              <b>{list.length}</b> artículos
            </span>
            <div className="r">
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar">
                <option value="rel">Relevancia</option>
                <option value="asc">Menor precio</option>
                <option value="desc">Mayor precio</option>
                <option value="stock">Más stock</option>
              </select>
              <div className="w-vt">
                <button aria-pressed={view === 'list'} onClick={() => setView('list')}>
                  Lista
                </button>
                <button aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
                  Grilla
                </button>
              </div>
            </div>
          </div>
          {rows}
        </main>
        <aside className="w-ord" ref={order}>
          <h4>Tu pedido</h4>
          {lines.length > 0 ? (
            <>
              {lines.map((l) => (
                <div className="ln" key={l.id}>
                  <span>
                    {l.qty} × {l.product.name}
                    {l.product.variants.length > 1 ? ` (${l.variant.label})` : ''}
                  </span>
                  <b>{money(l.variant.price * l.qty)}</b>
                  <small>{l.product.sku}</small>
                </div>
              ))}
              <div className="tot">
                <span>Total</span>
                <span>{money(ctx.total)}</span>
              </div>
              <button className="send" onClick={ctx.openCart}>
                {store.whatsappNumber ? 'Revisar y enviar por WhatsApp' : 'Revisar y enviar'}
              </button>
            </>
          ) : (
            <p className="em">
              Todavía vacío.
              <br />
              Usá “Agregar” en cada fila.
            </p>
          )}
          <p className="em" style={{ fontSize: 11.5 }}>
            {pricesNote(ctx)}. No se cobra nada ahora.
          </p>
        </aside>
      </div>
    </>
  );
}

function View({ ctx, p }: { ctx: StoreCtx; p: StorefrontProduct }) {
  const [v, setV] = useVariant(p);
  const net = netNote(ctx, v);
  return (
    <>
      <div className="scrim" onClick={ctx.close} />
      <div className="pv" role="dialog" aria-modal="true" aria-label={p.name}>
        <div className="pvh">
          <span>
            {p.sku ? `${p.sku} · ` : ''}
            {p.category.toUpperCase()}
          </span>
          <button onClick={ctx.close}>CERRAR ✕</button>
        </div>
        <div className="pvb">
          <Gallery p={p} />
          <h2>{p.name}</h2>
          {p.description && <p style={{ lineHeight: 1.6, color: '#444' }}>{p.description}</p>}
          <Options p={p} value={v} onChange={setV} />
          <table>
            <tbody>
              {specRows(p, v).map(([k, val]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pbar">
            <div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: '#aaa' }}>{priceNote(ctx).toUpperCase()}</div>
              <div className="pr">{money(v?.price ?? p.price)}</div>
              {net && <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: '#aaa' }}>{net}</div>}
            </div>
            <button
              className="w-add"
              style={{ height: 46, borderLeft: '1px solid #121212', fontSize: 14 }}
              onClick={(e) => v && ctx.add(p, v.id, 1, e.currentTarget)}
            >
              + Agregar al pedido
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const Taller: TemplateModule = { Page, View };
export default Taller;
