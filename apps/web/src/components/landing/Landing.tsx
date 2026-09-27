'use client';

import { MARK_PATH } from '@/components/ui/oplexMark';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { COMPARISON, COMPARISON_SOURCES, COMPETITORS, TESTIMONIALS, type PublicPlan } from './data';
import './landing.css';

const MARK_VIEWBOX = '229 229 573 378';
// Un poco más de aire que el logo para que el trazo y el brillo del punto
// no se corten en el borde.
const LOOP_VIEWBOX = '215 215 601 406';
const RECOMMENDED_PLAN = 'SILVER';
const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;

const ars = new Intl.NumberFormat('es-AR');

function Mark({ fill = 'url(#lp-hg)' }: { fill?: string }) {
  return (
    <svg viewBox={MARK_VIEWBOX} aria-hidden="true">
      <path d={MARK_PATH} fill={fill} fillRule="evenodd" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function planFeatures(plan: PublicPlan): { text: string; off?: boolean }[] {
  const n = (v: number, one: string, many: string) => `${ars.format(v)} ${v === 1 ? one : many}`;
  return [
    { text: n(plan.maxUsers, 'usuario', 'usuarios') },
    { text: n(plan.maxClients, 'cliente', 'clientes') },
    { text: `${n(plan.maxMonthlyInvoices, 'comprobante', 'comprobantes')} por mes` },
    { text: 'Facturación ARCA, Caja, stock, compras y contabilidad' },
    plan.productionModuleEnabled ? { text: 'Producción con recetas' } : { text: 'Producción', off: true },
    plan.aiAssistantMonthlyQueryQuota != null
      ? { text: `Asistente de IA: ${ars.format(plan.aiAssistantMonthlyQueryQuota)} consultas por mes` }
      : { text: 'Asistente de IA', off: true },
    plan.aiInvoiceScanMonthlyQuota != null
      ? { text: `${ars.format(plan.aiInvoiceScanMonthlyQuota)} facturas de compra con IA por mes` }
      : { text: 'Facturas de compra con IA', off: true },
  ];
}

const CHAT_SCRIPT: [('me' | 'bot'), string][] = [
  ['me', '¿Cuánto facturé hoy?'],
  ['bot', 'Hoy facturaste <span class="mono">$ 412.600</span> en 38 ventas, un 12 % más que el martes pasado.'],
  ['me', '¿Qué tengo que reponer?'],
  ['bot', 'Hay 3 artículos bajo el mínimo: <span class="mono">Yerba 1 kg (4)</span>, <span class="mono">Aceite 900 ml (2)</span> y <span class="mono">Arroz 1 kg (6)</span>.'],
  ['me', '¿Cuánto me debe Molinos del Sur?'],
  ['bot', 'Te debe <span class="mono">$ 223.003</span>. La factura vence el 14/10.'],
];

/**
 * Landing pública (/). Réplica del mockup aprobado el 2026-09-27 + la tabla
 * comparativa y los planes reales. Las animaciones son las del mockup,
 * portadas tal cual a un único efecto (DOM directo, sin estado de React:
 * son loops decorativos que no deben re-renderizar nada).
 */
export default function Landing({ plans }: { plans: PublicPlan[] }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = <T extends Element>(s: string) => el.querySelector<T>(s);
    const qa = <T extends Element>(s: string) => Array.from(el.querySelectorAll<T>(s));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const every = (fn: () => void, ms: number) => timers.push(window.setInterval(fn, ms));
    let raf = 0;
    const cleanups: (() => void)[] = [];

    // Hero: el ∞ se dibuja y un punto recorre el circuito.
    const stroke = q<SVGPathElement>('#lp-loop-stroke');
    const dot = q<SVGCircleElement>('#lp-dot');
    const stages = qa<HTMLElement>('.stages .stage');
    if (stroke && dot) {
      const len = stroke.getTotalLength();
      stroke.style.strokeDasharray = String(len);
      stroke.style.strokeDashoffset = reduce ? '0' : String(len);
      const setStage = (i: number) =>
        stages.forEach((s, k) => {
          s.classList.toggle('on', k === i);
          s.classList.toggle('done', k < i);
        });
      if (reduce) {
        const p = stroke.getPointAtLength(len * 0.35);
        dot.setAttribute('cx', String(p.x));
        dot.setAttribute('cy', String(p.y));
        setStage(4);
      } else {
        stroke.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
          duration: 2200,
          easing: 'cubic-bezier(.6,.05,.2,1)',
          fill: 'forwards',
        });
        const LOOP = 9000;
        const start = performance.now() + 1600;
        const tick = (now: number) => {
          const t = (Math.max(0, now - start) % LOOP) / LOOP;
          const p = stroke.getPointAtLength(len * t);
          dot.setAttribute('cx', String(p.x));
          dot.setAttribute('cy', String(p.y));
          setStage(now < start ? -1 : Math.min(4, Math.floor(t * 5)));
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }
    }

    // Tarjetas: brillo que sigue al mouse.
    qa<HTMLElement>('.card').forEach((c) => {
      const onMove = (e: PointerEvent) => {
        const r = c.getBoundingClientRect();
        c.style.setProperty('--mx', `${e.clientX - r.left}px`);
        c.style.setProperty('--my', `${e.clientY - r.top}px`);
      };
      c.addEventListener('pointermove', onMove);
      cleanups.push(() => c.removeEventListener('pointermove', onMove));
    });

    // Circuito: la línea se llena con el scroll.
    const steps = q<HTMLElement>('#lp-steps');
    const railFill = q<HTMLElement>('#lp-rail-fill');
    if (steps && railFill) {
      const stepEls = qa<HTMLElement>('#lp-steps .step');
      const onScroll = () => {
        const r = steps.getBoundingClientRect();
        const vh = window.innerHeight;
        const p = reduce ? 1 : Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.6)));
        railFill.style.setProperty('--p', `${p * 100}%`);
        stepEls.forEach((s, i) => s.classList.toggle('lit', p >= i / (stepEls.length - 1) - 0.02));
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      cleanups.push(() => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      });
      onScroll();
    }

    // Demo de alta por CUIT (también funciona con movimiento reducido).
    const btn = q<HTMLButtonElement>('#lp-cuit-btn');
    const txt = q<HTMLElement>('#lp-cuit-txt');
    const fields = qa<HTMLElement>('#lp-out .f');
    let busy = false;
    const demo = () => {
      if (busy || !btn || !txt) return;
      busy = true;
      const full = '30-71456203-9';
      txt.textContent = '';
      fields.forEach((f) => {
        f.classList.remove('filled');
        const v = f.querySelector('.val');
        if (v) v.innerHTML = '<span class="skeleton"></span>';
      });
      let i = 0;
      const type = () => {
        if (i < full.length) {
          txt.textContent += full[i++];
          later(type, reduce ? 0 : 70);
          return;
        }
        btn.textContent = 'Consultando…';
        later(() => {
          fields.forEach((f, k) =>
            later(() => {
              const v = f.querySelector('.val');
              if (v) v.textContent = f.dataset['v'] ?? '';
              f.classList.add('filled');
              if (k === fields.length - 1) {
                btn.textContent = 'Buscar en ARCA';
                busy = false;
              }
            }, k * 260),
          );
        }, 900);
      };
      type();
    };
    btn?.addEventListener('click', demo);
    cleanups.push(() => btn?.removeEventListener('click', demo));

    const observers: IntersectionObserver[] = [];
    const onceVisible = (target: Element | null, fn: () => void, threshold: number) => {
      if (!target) return;
      const o = new IntersectionObserver(
        (entries) => entries.forEach((e) => e.isIntersecting && (fn(), o.disconnect())),
        { threshold },
      );
      o.observe(target);
      observers.push(o);
    };
    onceVisible(q('#lp-out'), demo, 0.6);

    if (!reduce) {
      // Chat de WhatsApp en loop.
      const chat = q<HTMLElement>('#lp-chat');
      if (chat) {
        const add = (kind: string, html: string) => {
          const d = document.createElement('div');
          d.className = `msg ${kind}`;
          d.innerHTML = html;
          chat.appendChild(d);
          const msgs = chat.querySelectorAll('.msg');
          if (msgs.length > 4) msgs[0].remove();
        };
        const run = () => {
          chat.querySelectorAll('.msg, .typing').forEach((n) => n.remove());
          let i = 0;
          const next = () => {
            if (i >= CHAT_SCRIPT.length) {
              later(run, 3500);
              return;
            }
            const [kind, html] = CHAT_SCRIPT[i++];
            if (kind === 'bot') {
              const t = document.createElement('div');
              t.className = 'msg bot typing';
              t.innerHTML = '<span></span><span></span><span></span>';
              chat.appendChild(t);
              later(() => {
                t.remove();
                add('bot', html);
                later(next, 1700);
              }, 1100);
            } else {
              add('me', html);
              later(next, 700);
            }
          };
          next();
        };
        later(run, 2500);
      }

      // Comprobante: se resaltan los campos a medida que pasa el escáner.
      const rows = qa<HTMLElement>('#lp-receipt .row');
      every(() => {
        rows.forEach((r, i) =>
          later(() => {
            r.classList.add('hit');
            later(() => r.classList.remove('hit'), 900);
          }, 350 + i * 380),
        );
      }, 3600);

      // Producción: se tildan los insumos.
      const ins = qa<HTMLElement>('#lp-bom .ins');
      const runBom = () => {
        ins.forEach((x) => x.classList.remove('ok'));
        ins.forEach((x, i) => later(() => x.classList.add('ok'), 600 + i * 600));
      };
      runBom();
      every(runBom, 5200);

      // Tablero: la cifra cuenta y la línea se dibuja al entrar en pantalla.
      const kpi = q<HTMLElement>('#lp-kpi');
      const line = q<SVGPathElement>('#lp-spark-line');
      onceVisible(
        kpi,
        () => {
          if (!kpi || !line) return;
          const to = Number(kpi.dataset['to']);
          const t0 = performance.now();
          const f = (now: number) => {
            const k = Math.min(1, (now - t0) / 1400);
            kpi.textContent = `$ ${ars.format(Math.round(to * (1 - Math.pow(1 - k, 3))))}`;
            if (k < 1) requestAnimationFrame(f);
          };
          requestAnimationFrame(f);
          const ll = line.getTotalLength();
          line.animate(
            [
              { strokeDasharray: `${ll}`, strokeDashoffset: ll },
              { strokeDasharray: `${ll}`, strokeDashoffset: 0 },
            ],
            { duration: 1400, easing: 'ease-out' },
          );
        },
        0.5,
      );
    }

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((t) => {
        clearTimeout(t);
        clearInterval(t);
      });
      observers.forEach((o) => o.disconnect());
      cleanups.forEach((fn) => fn());
    };
  }, []);

  const sortedPlans = [...plans].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="lp" ref={root}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <linearGradient id="lp-hg" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#2dd4bf" />
            <stop offset="1" stopColor="#4ade80" />
          </linearGradient>
          <linearGradient id="lp-hg2" x1="0" x2="1">
            <stop offset="0" stopColor="#2dd4bf" />
            <stop offset=".5" stopColor="#4ade80" />
            <stop offset="1" stopColor="#818cf8" />
          </linearGradient>
          <linearGradient id="lp-sg" x1="0" x2="1">
            <stop offset="0" stopColor="#2dd4bf" />
            <stop offset="1" stopColor="#4ade80" />
          </linearGradient>
          <linearGradient id="lp-sa" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#2dd4bf" stopOpacity=".35" />
            <stop offset="1" stopColor="#2dd4bf" stopOpacity="0" />
          </linearGradient>
          <filter id="lp-glow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      <div className="aurora" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="grain" aria-hidden="true" />

      <header className="nav gutter">
        <div className="container nav-in">
          <a className="brand" href="#top" aria-label="Oplex, inicio">
            <Mark />
            OPLEX
          </a>
          <nav className="nav-links" aria-label="Secciones">
            <a href="#circuito">Cómo funciona</a>
            <a href="#funciones">Funciones</a>
            <a href="#planes">Planes</a>
            <a href="#comparativa">Comparativa</a>
            <a href="#faq">Preguntas</a>
          </nav>
          <div className="nav-cta">
            <Link className="login" href="/login">
              Ingresar
            </Link>
            <Link className="btn btn-primary btn-sm" href="/signup">
              Probar gratis
            </Link>
          </div>
        </div>
      </header>

      <main id="top">
        {/* HERO */}
        <section className="hero gutter">
          <div className="container hero-grid">
            <div>
              <span className="badge">
                <b>NUEVO</b> Preguntale a tu negocio por WhatsApp
              </span>
              <h1>
                <span className="line">
                  <span className="word">Vendés</span>{' '}
                  <span className="word" style={{ animationDelay: '.08s' }}>una</span>{' '}
                  <span className="word" style={{ animationDelay: '.16s' }}>vez.</span>
                </span>
                <span className="line">
                  <span className="word grad-text" style={{ animationDelay: '.3s' }}>Oplex</span>{' '}
                  <span className="word grad-text" style={{ animationDelay: '.38s' }}>hace</span>{' '}
                  <span className="word grad-text" style={{ animationDelay: '.46s' }}>el</span>{' '}
                  <span className="word grad-text" style={{ animationDelay: '.54s' }}>resto.</span>
                </span>
              </h1>
              <p className="sub">
                En cada venta se piden el <b>CAE a ARCA</b>, se descuenta el <b>stock</b>, se registra el{' '}
                <b>asiento contable</b> y se actualiza el <b>tablero</b>. Sin pasar datos de un lado a otro, sin
                planillas.
              </p>
              <div className="hero-ctas">
                <Link className="btn btn-primary" href="/signup">
                  Probar gratis 15 días
                </Link>
                <a className="btn btn-ghost" href="#circuito">
                  Ver cómo funciona
                </a>
              </div>
              <div className="trust">
                <span>Factura A, B y C con CAE</span>
                <span>Sin tarjeta para probar</span>
                <span>Entrás con Google o Microsoft</span>
              </div>
            </div>

            <div className="engine" aria-label="Animación: una venta recorre el circuito de Oplex">
              <div className="engine-top">
                <span>Caja 1 · Sucursal Centro</span>
                <span className="live">EN VIVO</span>
              </div>
              <div className="loop-wrap">
                <svg viewBox={LOOP_VIEWBOX} aria-hidden="true">
                  <path id="loopFill" d={MARK_PATH} fillRule="evenodd" />
                  <path id="lp-loop-stroke" className="loop-stroke" d={MARK_PATH} />
                  <circle id="lp-dot" className="loop-dot" r="9" cx="-100" cy="-100" />
                </svg>
              </div>
              <div className="stages">
                <Stage icon={<><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M7 20h10M12 16v4" /></>} t="Venta en Caja" d="2 × Yerba 1 kg · 1 × Azúcar" v="$ 9.840" />
                <Stage icon={<><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /><path d="M9 12l2 2 4-4" /></>} t="ARCA aprueba" d="Factura B 0001-00004821" v="CAE ✓ 0,9 s" />
                <Stage icon={<><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /></>} t="Stock actualizado" d="Yerba 1 kg · Depósito Central" v="48 → 46" />
                <Stage icon={<><path d="M4 4h16v16H4z" /><path d="M4 10h16M10 10v10" /></>} t="Asiento contable" d="Deudores / Ventas / IVA DF" v="N.º 1.284" />
                <Stage icon={<><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></>} t="Tablero" d="Facturado hoy" v="$ 412.600" />
              </div>
              <p className="engine-note">Datos de ejemplo</p>
            </div>
          </div>
        </section>

        {/* INTEGRACIONES */}
        <div className="integr">
          <p>Conectado con lo que ya usás</p>
          <div className="mask-x">
            <div className="marquee" aria-hidden="true">
              {[0, 1].flatMap((n) =>
                ['ARCA', 'Mercado Pago', 'WhatsApp', 'Google', 'Microsoft', 'Excel', 'Email'].map((name) => (
                  <span key={`${n}-${name}`}>
                    <i />
                    {name}
                  </span>
                )),
              )}
            </div>
          </div>
        </div>

        {/* CIRCUITO */}
        <section className="block gutter" id="circuito">
          <div className="container">
            <div className="sec-head">
              <p className="eyebrow">El circuito</p>
              <h2>
                Cargás una vez. <span className="grad-text">Se completa todo lo demás.</span>
              </h2>
              <p>Nada de exportar de un módulo para importar en otro: en Oplex cada operación dispara la siguiente.</p>
            </div>
            <div className="steps" id="lp-steps">
              <div className="rail">
                <b id="lp-rail-fill" />
              </div>
              <Step n={1} h="Vendés" p="En la Caja, en una factura o desde una cotización aprobada." ex="Cotización N.º 312 → Factura" />
              <Step n={2} h="ARCA autoriza" p="Oplex pide el CAE y arma el PDF con el QR fiscal, en ticket o A4." ex="CAE 76393… · vence 07/10" />
              <Step n={3} h="Stock y costos" p="Baja el stock del depósito correcto y calcula el costo por promedio ponderado." ex="Costo de lo vendido: $ 6.120" />
              <Step n={4} h="Tu contador lo ve" p="El asiento queda registrado y el estado de resultados al día." ex="Libro diario · asiento 1.284" />
            </div>
          </div>
        </section>

        {/* FUNCIONES */}
        <section className="block gutter" id="funciones">
          <div className="container">
            <div className="sec-head">
              <p className="eyebrow">Funciones</p>
              <h2>
                Todo lo que tu pyme usa, <span className="grad-text">en un solo lugar</span>
              </h2>
            </div>
            <div className="bento">
              <article className="card w4">
                <span className="tagline">Asistente de IA</span>
                <h3>Preguntale a tu negocio, por WhatsApp</h3>
                <p>Responde con tus datos reales: ventas del día, stock bajo mínimo, lo que te debe un cliente. Sólo lee, nunca modifica nada.</p>
                <div className="stage-box">
                  <div className="chat" id="lp-chat" aria-live="polite">
                    <div className="chat-h">
                      <i>
                        <Mark fill="#04221c" />
                      </i>
                      <div>
                        <b>Oplex</b>asistente de tu empresa
                      </div>
                    </div>
                    <div className="msg me">¿Cuánto facturé hoy?</div>
                    <div className="msg bot">
                      Hoy facturaste <span className="mono">$ 412.600</span> en 38 ventas, un 12 % más que el martes pasado.
                    </div>
                  </div>
                </div>
              </article>

              <article className="card">
                <span className="tagline">Compras con IA</span>
                <h3>Sacale una foto a la factura</h3>
                <p>Lee el QR de ARCA y los datos del comprobante, y te marca qué tan segura está de cada campo.</p>
                <div className="stage-box">
                  <div className="receipt" id="lp-receipt">
                    <div className="scan" />
                    <div className="rh">
                      <span>FACTURA A</span>
                      <span>0003-00018842</span>
                    </div>
                    {[
                      ['Proveedor', 'Molinos del Sur SA'],
                      ['CUIT', '30-71456203-9'],
                      ['Neto gravado', '$ 184.300'],
                      ['IVA 21 %', '$ 38.703'],
                      ['Total', '$ 223.003'],
                    ].map(([k, v]) => (
                      <div className="row" key={k}>
                        <span>{k}</span>
                        <span>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="conf">
                    <span>Confianza de la lectura</span>
                    <b>Alta · 0,94</b>
                  </div>
                </div>
              </article>

              <article className="card">
                <span className="tagline">Caja</span>
                <h3>Punto de venta rápido</h3>
                <p>Turnos por caja y sucursal. Ticket con CAE y QR al instante.</p>
                <div className="stage-box">
                  <div className="ticket-slot" aria-hidden="true">
                    <div className="ticket">
                      <div className="c">ALMACÉN LA ESQUINA</div>
                      <div className="c">FACTURA B · 0001-00004821</div>
                      <hr />
                      <div className="r"><span>2 Yerba 1 kg</span><span>7.380</span></div>
                      <div className="r"><span>1 Azúcar 1 kg</span><span>2.460</span></div>
                      <hr />
                      <div className="r"><b>TOTAL</b><b>$ 9.840</b></div>
                      <div className="c">CAE 76393028866956</div>
                      <div className="qr" />
                    </div>
                  </div>
                </div>
              </article>

              <article className="card">
                <span className="tagline">Producción</span>
                <h3>Recetas y órdenes</h3>
                <p>Definís qué insumos lleva cada producto; la orden los reserva y descuenta.</p>
                <div className="stage-box">
                  <div className="bom" id="lp-bom">
                    <div className="prod">
                      <span>Mesa ratona roble</span>
                      <span className="mono">OP-0042 · 3 u.</span>
                    </div>
                    {[
                      ['Tabla roble 2 m', '6 u.'],
                      ['Tornillo 6×40', '48 u.'],
                      ['Laca poliuretánica', '1,5 l'],
                      ['Patas de hierro', '12 u.'],
                    ].map(([k, v]) => (
                      <div className="ins" key={k}>
                        <span className="chk" />
                        <span>{k}</span>
                        <span className="mono">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>

              <article className="card">
                <span className="tagline">Tablero</span>
                <h3>Tu negocio, en tiempo real</h3>
                <p>Cada venta se ve al instante, desde cualquier caja o computadora.</p>
                <div className="stage-box">
                  <div className="kpi">
                    <div>
                      <small style={{ color: 'var(--dim)', fontSize: 12.5 }}>Facturado hoy</small>
                      <div className="big" id="lp-kpi" data-to="412600">$ 412.600</div>
                    </div>
                    <span className="delta">+12 %</span>
                  </div>
                  <svg className="spark" viewBox="0 0 300 96" preserveAspectRatio="none" aria-hidden="true">
                    <line x1="0" y1="24" x2="300" y2="24" />
                    <line x1="0" y1="56" x2="300" y2="56" />
                    <line x1="0" y1="88" x2="300" y2="88" />
                    <path className="a" d="M4 70 L50 62 L96 66 L142 44 L188 50 L234 30 L296 16 L296 88 L4 88 Z" />
                    <path className="l" id="lp-spark-line" d="M4 70 L50 62 L96 66 L142 44 L188 50 L234 30 L296 16" />
                    <circle cx="296" cy="16" r="4" fill="#4ade80" />
                  </svg>
                </div>
              </article>

              <article className="card">
                <span className="tagline">Agenda</span>
                <h3>Ningún vencimiento se te pasa</h3>
                <p>Cobros, pagos e impuestos en un calendario, con recordatorios automáticos a tus clientes.</p>
                <div className="stage-box">
                  <div className="agenda" aria-hidden="true">
                    {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                      <span className="dh" key={i}>{d}</span>
                    ))}
                    {[
                      [6, ''], [7, 'ev c'], [8, ''], [9, 'ev p'], [10, ''], [11, ''], [12, ''],
                      [13, ''], [14, 'ev t today'], [15, 'ev c'], [16, ''], [17, 'ev p'], [18, ''], [19, ''],
                    ].map(([n, cls]) => (
                      <span className={`d ${cls}`} key={n}>{n}</span>
                    ))}
                  </div>
                  <div className="legend">
                    <span style={{ '--c': '#4ade80' } as React.CSSProperties}>Cobros</span>
                    <span style={{ '--c': '#fbbf24' } as React.CSSProperties}>Pagos</span>
                    <span style={{ '--c': '#f87171' } as React.CSSProperties}>Impuestos</span>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* DEMO CUIT */}
        <section className="block gutter" id="cuit">
          <div className="container">
            <div className="sec-head">
              <p className="eyebrow">Alta por CUIT</p>
              <h2>
                Escribís el CUIT. <span className="grad-text">ARCA completa el resto.</span>
              </h2>
            </div>
            <div className="cuit">
              <div className="cuit-list">
                {[
                  ['Razón social, condición IVA y domicilio', 'Tomados del padrón de ARCA, sin errores de tipeo.'],
                  ['Te dice qué factura corresponde', 'A, B o C según tu condición y la del cliente.'],
                  ['Funciona desde el primer minuto', 'No hace falta haber conectado tu certificado todavía.'],
                  ['Y la conexión con ARCA, guiada', 'Oplex genera tu clave y te muestra cada pantalla de ARCA con ejemplos.'],
                ].map(([b, s]) => (
                  <div key={b}>
                    <Check />
                    <p>
                      <b>{b}</b>
                      <span>{s}</span>
                    </p>
                  </div>
                ))}
              </div>
              <div className="form" aria-label="Demostración de alta de cliente por CUIT">
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="lp-cuit-inp">CUIT del cliente</label>
                    <div className="inp" id="lp-cuit-inp" role="textbox" aria-readonly="true">
                      <span id="lp-cuit-txt">30-71456203-9</span>
                      <span className="caret" />
                    </div>
                  </div>
                  <div className="field">
                    <label>&nbsp;</label>
                    <button className="btn btn-primary" id="lp-cuit-btn" type="button">
                      Buscar en ARCA
                    </button>
                  </div>
                </div>
                <div className="out" id="lp-out">
                  {[
                    ['Razón social', 'Molinos del Sur SA', 'DE ARCA'],
                    ['Condición IVA', 'Responsable Inscripto', 'DE ARCA'],
                    ['Domicilio fiscal', 'Av. San Martín 1450, Godoy Cruz, Mendoza', 'DE ARCA'],
                    ['Le corresponde', 'Factura A', 'SUGERIDO'],
                  ].map(([label, value, src]) => (
                    <div className="f" data-v={value} key={label}>
                      <div>
                        <small>{label}</small>
                        <div className="val">{value}</div>
                      </div>
                      <span className="src">{src}</span>
                    </div>
                  ))}
                </div>
                <p className="foot">Demostración con datos de ejemplo.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CONTADORES + SEGURIDAD */}
        <section className="block gutter" id="contadores">
          <div className="container">
            <div className="sec-head">
              <p className="eyebrow">Para contadores y para tu tranquilidad</p>
              <h2>
                Tu estudio contable, <span className="grad-text">adentro del sistema</span>
              </h2>
            </div>
            <div className="split">
              <div className="panel">
                <h3>Portal para estudios</h3>
                <p>El contador ve la cartera completa de empresas que atiende, con acceso que el cliente da y quita cuando quiere.</p>
                <ul className="ticks">
                  <li>Libro diario, mayor y sumas y saldos al día</li>
                  <li>Ajuste por inflación contable</li>
                  <li>Retenciones, vencimientos y cheques</li>
                </ul>
                <div className="portfolio">
                  <div><span>Almacén La Esquina</span><span className="mono">Monotributo</span><span className="st ok">Al día</span></div>
                  <div><span>Carpintería Roble</span><span className="mono">Resp. Inscripto</span><span className="st warn">IVA vence 18/10</span></div>
                  <div><span>Molinos del Sur SA</span><span className="mono">Resp. Inscripto</span><span className="st ok">Al día</span></div>
                </div>
              </div>
              <div className="panel">
                <h3>Seguridad de verdad</h3>
                <p>Cada empresa está aislada en la propia base de datos, no sólo en la pantalla. Tus certificados y claves se guardan cifrados.</p>
                <ul className="ticks">
                  <li>Roles y permisos por módulo para tu equipo</li>
                  <li>Registro de cada cambio: quién, cuándo y qué</li>
                  <li>Copias de seguridad automáticas todos los días</li>
                </ul>
                <div className="shield">
                  <div><b>Aislamiento</b><span>por empresa en la base de datos</span></div>
                  <div><b>Cifrado</b><span>certificados, claves y tokens</span></div>
                  <div><b>Auditoría</b><span>historial completo de cambios</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PLANES */}
        <section className="block gutter" id="planes">
          <div className="container">
            <div className="sec-head center">
              <p className="eyebrow">Planes</p>
              <h2>
                Empezá gratis. <span className="grad-text">Crecé cuando lo necesites.</span>
              </h2>
              <p>15 días de prueba con todo incluido, sin tarjeta.</p>
            </div>
            {sortedPlans.length > 0 ? (
              <div className="plans">
                {sortedPlans.map((plan) => {
                  const price = Number(plan.priceMonthly);
                  const rec = plan.key === RECOMMENDED_PLAN;
                  return (
                    <div className={`plan${rec ? ' rec' : ''}`} key={plan.key}>
                      {rec && <span className="rtag">RECOMENDADO</span>}
                      <h3>{plan.name}</h3>
                      <div className="price">
                        {price === 0 ? (
                          <span className="free">Gratis</span>
                        ) : (
                          <>
                            <b>$ {ars.format(price)}</b>
                            <span className="unit">por mes</span>
                          </>
                        )}
                      </div>
                      <ul>
                        {planFeatures(plan).map((f) => (
                          <li key={f.text} className={f.off ? 'off' : undefined}>
                            {f.text}
                          </li>
                        ))}
                      </ul>
                      <Link className={`btn ${rec ? 'btn-primary' : 'btn-ghost'}`} href="/signup">
                        {price === 0 ? 'Empezar gratis' : `Probar ${plan.name} gratis`}
                      </Link>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="plans-note">No pudimos cargar los planes en este momento. Probá recargar la página.</p>
            )}
            <p className="plans-note">Precios en pesos argentinos.</p>
          </div>
        </section>

        {/* COMPARATIVA */}
        <section className="block gutter" id="comparativa">
          <div className="container">
            <div className="sec-head">
              <p className="eyebrow">Comparativa</p>
              <h2>
                Oplex frente a los <span className="grad-text">sistemas más usados</span>
              </h2>
              <p>Arquitectura, módulos, inteligencia artificial y servicio, lado a lado.</p>
            </div>
            <div className="cmp-wins">
              <div><b>Todo en una suscripción</b><span>Caja, producción, contabilidad e IA sin productos aparte.</span></div>
              <div><b>Tu negocio por WhatsApp</b><span>Preguntás y te responde con tus números reales.</span></div>
              <div><b>En tiempo real</b><span>Todas las cajas y usuarios ven lo mismo al instante.</span></div>
              <div><b>Seguridad de base</b><span>Cada empresa aislada en la propia base de datos.</span></div>
            </div>
            <div className="cmp-wrap">
              <table className="cmp">
                <colgroup>
                  <col className="c-label" />
                  <col className="c-us" />
                  {COMPETITORS.map((c) => (
                    <col key={c} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th />
                    <th className="us">
                      Oplex<span>ESTE SISTEMA</span>
                    </th>
                    {COMPETITORS.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((g) => [
                    <tr className="group" key={g.group}>
                      <th colSpan={COMPETITORS.length + 2}>{g.group}</th>
                    </tr>,
                    ...g.rows.map((r) => (
                      <tr key={r.label}>
                        <th>
                          {r.label}
                          {r.detail && <small>{r.detail}</small>}
                        </th>
                        <td className="us">{r.oplex}</td>
                        {r.others.map((cell, i) => (
                          <td key={COMPETITORS[i]} className={cell.kind}>
                            {cell.text}
                          </td>
                        ))}
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </div>
            <p className="cmp-foot">
              Datos de cada sistema tomados de sus sitios y centros de ayuda públicos al 27/09/2026 (
              {COMPARISON_SOURCES.map((s, i) => (
                <span key={s.name}>
                  {i > 0 && ', '}
                  <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
                    {s.name}
                  </a>
                </span>
              ))}
              ). &quot;Consultar&quot; significa que no lo encontramos publicado, no que no lo tengan. Las marcas pertenecen
              a sus respectivos dueños.
            </p>
          </div>
        </section>

        {/* TESTIMONIOS */}
        <section className="block gutter" id="testimonios">
          <div className="container">
            <div className="tests-head">
              <h3>Lo que dicen quienes lo usan</h3>
            </div>
            <div className="tests">
              {TESTIMONIALS.map((t) => (
                <figure className="tcard" key={t.name}>
                  <div className="top">
                    <span className="tfeat">{t.feature}</span>
                    {t.example && <span className="tex">EJEMPLO</span>}
                  </div>
                  <blockquote>“{t.quote}”</blockquote>
                  <figcaption>
                    <span className="av">{t.initials}</span>
                    <span>
                      <b>{t.name}</b>
                      <small>{t.role}</small>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="block gutter" id="faq">
          <div className="container">
            <div className="sec-head">
              <p className="eyebrow">Preguntas frecuentes</p>
              <h2>Lo que nos preguntan antes de empezar</h2>
            </div>
            <div className="faq">
              <details open>
                <summary>¿Necesito certificado de ARCA para probar?</summary>
                <p>No. Podés cargar tu empresa, artículos y clientes desde el primer minuto. Para emitir facturas con CAE, Oplex te guía paso a paso para generar tu certificado y autorizarlo en ARCA.</p>
              </details>
              <details>
                <summary>¿Sirve si soy monotributista?</summary>
                <p>Sí. Emitís Factura C, y el comprobante sale sin discriminar IVA como corresponde.</p>
              </details>
              <details>
                <summary>¿Puedo traer mis artículos desde Excel?</summary>
                <p>Sí. Descargás la plantilla, la completás siguiendo las indicaciones y la subís.</p>
              </details>
              <details>
                <summary>¿El asistente de IA puede cambiar mis datos?</summary>
                <p>No. Sólo lee, y respeta los permisos de cada usuario: un vendedor no ve lo que no puede ver en el sistema.</p>
              </details>
              <details>
                <summary>¿Mi contador puede entrar?</summary>
                <p>Sí. Lo invitás y accede a tu contabilidad desde su portal de estudio. Le quitás el acceso cuando quieras.</p>
              </details>
            </div>
          </div>
        </section>

        {/* CIERRE */}
        <section className="gutter">
          <div className="container">
            <div className="final">
              <svg className="bigmark" viewBox={LOOP_VIEWBOX} aria-hidden="true">
                <path d={MARK_PATH} />
              </svg>
              <h2>
                Dejá de pasar datos a mano. <span className="grad-text">Empezá hoy.</span>
              </h2>
              <p>Creá tu cuenta en un minuto con Google o Microsoft y probá Oplex 15 días con todo incluido.</p>
              <div className="hero-ctas" style={{ justifyContent: 'center', marginTop: 0 }}>
                <Link className="btn btn-primary" href="/signup">
                  Probar gratis 15 días
                </Link>
                <Link className="btn btn-ghost" href="/login">
                  Ya tengo cuenta
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="gutter">
        <div className="container foot-in">
          <a className="brand" href="#top">
            <Mark />
            OPLEX
          </a>
          <div className="foot-links">
            <a href="#funciones">Funciones</a>
            <a href="#planes">Planes</a>
            <a href="#comparativa">Comparativa</a>
            <a href="#faq">Preguntas</a>
          </div>
          <span>ERP en la nube para pymes argentinas</span>
        </div>
      </footer>

      {WHATSAPP_NUMBER && (
        <a
          className="wa"
          href={`https://wa.me/${WHATSAPP_NUMBER}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Escribinos por WhatsApp"
        >
          <svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.6a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z" />
          </svg>
        </a>
      )}
    </div>
  );
}

function Stage({ icon, t, d, v }: { icon: React.ReactNode; t: string; d: string; v: string }) {
  return (
    <div className="stage">
      <div className="ic">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </div>
      <div>
        <div className="t">{t}</div>
        <div className="d">{d}</div>
      </div>
      <div className="v">{v}</div>
    </div>
  );
}

function Step({ n, h, p, ex }: { n: number; h: string; p: string; ex: string }) {
  return (
    <div className="step">
      <div className="n">{n}</div>
      <h3>{h}</h3>
      <p>{p}</p>
      <div className="ex">{ex}</div>
    </div>
  );
}
