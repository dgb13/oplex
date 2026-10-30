'use client';

import { decodeToken } from '@/lib/jwt';
import {
  drawFrame,
  SPOT_BEATS,
  SPOT_DEFAULTS,
  SPOT_DURATION,
  SPOT_FORMATS,
  SPOT_SCENE_TITLES,
  type SpotConfig,
  type SpotFormat,
  type SpotScene,
} from '@/lib/marketing/spot-engine';
import { Download, Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

type Draft = Omit<SpotConfig, 'fontFamily'>;
type TextKey = 'hook' | 'sceneTitle' | 'cta' | 'site';

const FORMAT_OPTIONS: Array<{ value: SpotFormat; label: string; hint: string }> = [
  { value: '9x16', label: '9:16', hint: 'Reels · Stories' },
  { value: '1x1', label: '1:1', hint: 'Feed' },
  { value: '16x9', label: '16:9', hint: 'YouTube · web' },
];

const SCENE_OPTIONS: Array<{ value: SpotScene; label: string; hint: string }> = [
  { value: 'circuito', label: 'Circuito', hint: 'venta → ARCA' },
  { value: 'whatsapp', label: 'WhatsApp', hint: 'asistente IA' },
  { value: 'factura', label: 'Factura', hint: 'foto con IA' },
  { value: 'excel', label: 'Excel IA', hint: 'importación' },
  { value: 'mp', label: 'Mercado Pago', hint: 'cobros' },
  { value: 'produccion', label: 'Producción', hint: 'recetas' },
  { value: 'qr', label: 'Caja QR', hint: 'punto de venta' },
];

const TEXT_FIELDS: Array<{ key: TextKey; label: string; maxLength: number; hint?: string }> = [
  { key: 'hook', label: 'Gancho', maxLength: 60, hint: 'La última palabra sale en naranja. Hasta 6 palabras se leen bien.' },
  { key: 'sceneTitle', label: 'Titular de la escena', maxLength: 60 },
  { key: 'cta', label: 'Botón de cierre', maxLength: 32 },
  { key: 'site', label: 'Sitio', maxLength: 40 },
];

const STORAGE_KEY = 'oplex-spot';
const INPUT_CLASS =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[13px] text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none';
const LABEL_CLASS = 'text-[11px] font-semibold uppercase tracking-wider text-slate-500';

const fmtT = (x: number) => x.toFixed(2).replace('.', ',');

function pickMime(): string {
  const opts = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return (
    opts.find((m) => {
      try {
        return MediaRecorder.isTypeSupported(m);
      } catch {
        return false;
      }
    }) ?? ''
  );
}

function loadDraft(): Draft {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Draft> | null;
    if (saved) return { ...SPOT_DEFAULTS, ...saved };
  } catch {
    // Sin storage (ventana privada, etc.): arranca con los valores por defecto.
  }
  return { ...SPOT_DEFAULTS };
}

interface Result {
  url: string;
  fileName: string;
  meta: string;
}

/**
 * Generador de spots de 6 s (Admin › Marketing › Videos). Porte de
 * docs/referencia/oplex-spot.html: el dibujo vive en lib/marketing/spot-engine,
 * acá sólo está la vista previa, los controles y la grabación del canvas con
 * MediaRecorder. Todo en el navegador, sin backend.
 *
 * El loop de animación lee el estado desde refs (tiempo, play, grabación y
 * config) para no re-suscribirse en cada tecla; React sólo se entera de lo
 * que se ve fuera del canvas (barra de tiempo, botones, resultado).
 */
export default function SpotStudio({ fontFamily }: { fontFamily: string }) {
  // Sin endpoint propio no hay 403 que frene a un no-admin: se chequea el
  // flag del token (el mismo que decide el destino post-login).
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [draft, setDraft] = useState<Draft>(SPOT_DEFAULTS);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<{ text: string; tone?: 'ok' | 'err' }>({
    text: 'La grabación tarda 6 segundos. Dejá esta pestaña visible mientras graba.',
  });
  const [result, setResult] = useState<Result | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const configRef = useRef<SpotConfig>({ ...SPOT_DEFAULTS, fontFamily });
  const timeRef = useRef(0);
  const playingRef = useRef(true);
  const recordingRef = useRef(false);
  const fontsReadyRef = useRef<Promise<void> | null>(null);

  const redraw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawFrame(ctx, timeRef.current, configRef.current);
    setTime(timeRef.current);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setAllowed(Boolean(token && decodeToken(token)?.isPlatformAdmin));
    const loaded = loadDraft();
    configRef.current = { ...loaded, fontFamily };
    setDraft(loaded);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      playingRef.current = false;
      timeRef.current = 5.8;
      setPlaying(false);
    }
  }, [fontFamily]);

  // Cambiar width/height del canvas (formato) lo borra: se redibuja.
  useEffect(() => {
    if (allowed) redraw();
  }, [draft.format, allowed, redraw]);

  useEffect(() => {
    if (!allowed) return;
    fontsReadyRef.current = (async () => {
      try {
        await Promise.all(['500', '600', '700'].map((w) => document.fonts.load(`${w} 40px ${fontFamily}`)));
      } catch {
        // Si la fuente no carga, el motor cae a Helvetica/Arial.
      }
      redraw();
    })();
  }, [allowed, fontFamily, redraw]);

  useEffect(() => {
    if (!allowed) return;
    let raf = 0;
    let last: number | null = null;
    const loop = (now: number) => {
      if (playingRef.current && !recordingRef.current) {
        if (last != null) {
          timeRef.current += (now - last) / 1000;
          if (timeRef.current >= SPOT_DURATION) timeRef.current %= SPOT_DURATION;
        }
        last = now;
        redraw();
      } else last = null;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [allowed, redraw]);

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    configRef.current = { ...next, fontFamily };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Recordar el borrador es sólo una comodidad.
    }
    if (!recordingRef.current) redraw();
  };

  const changeScene = (scene: SpotScene) => {
    const prevDefault = SPOT_SCENE_TITLES[draft.scene];
    const keepTitle = draft.sceneTitle.trim() && draft.sceneTitle !== prevDefault;
    // En pausa, salta a la escena de producto para que se vea el cambio.
    if (!playingRef.current) timeRef.current = 3.7;
    update({ scene, sceneTitle: keepTitle ? draft.sceneTitle : SPOT_SCENE_TITLES[scene] });
  };

  const togglePlay = () => {
    if (recordingRef.current) return;
    playingRef.current = !playingRef.current;
    setPlaying(playingRef.current);
  };

  const scrub = (value: number) => {
    if (recordingRef.current) return;
    playingRef.current = false;
    setPlaying(false);
    timeRef.current = value / 100;
    redraw();
  };

  const generate = async () => {
    const cv = canvasRef.current;
    if (recordingRef.current || !cv) return;
    if (typeof MediaRecorder === 'undefined' || !cv.captureStream) {
      setStatus({ text: 'Este navegador no puede grabar video. Abrilo en Chrome, Edge o Safari en una computadora.', tone: 'err' });
      return;
    }
    const mime = pickMime();
    if (!mime) {
      setStatus({ text: 'Este navegador no tiene un formato de video compatible. Probá con Chrome o Edge.', tone: 'err' });
      return;
    }
    await fontsReadyRef.current;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    recordingRef.current = true;
    playingRef.current = false;
    setRecording(true);
    setPlaying(false);
    setStatus({ text: 'Grabando… dejá esta pestaña visible.' });

    const config = configRef.current;
    const [w, h] = SPOT_FORMATS[config.format];
    const stream = cv.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(w * h * 30 * 0.16) });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise<void>((r) => {
      rec.onstop = () => r();
    });
    drawFrame(ctx, 0, config);
    rec.start(100);
    await new Promise<void>((res) => {
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min((now - t0) / 1000, SPOT_DURATION - 1e-4);
        drawFrame(ctx, t, config);
        timeRef.current = t;
        setTime(t);
        setProgress(t / SPOT_DURATION);
        if (now - t0 >= SPOT_DURATION * 1000) {
          setProgress(1);
          res();
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    await new Promise((r) => setTimeout(r, 120));
    rec.stop();
    await stopped;
    stream.getTracks().forEach((tr) => tr.stop());

    const type = mime.split(';')[0];
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(chunks, { type });
    setResult({
      url: URL.createObjectURL(blob),
      fileName: `oplex-anuncio-${config.format}.${ext}`,
      meta: `${ext.toUpperCase()} · ${w}×${h} · 6 s · ${(blob.size / 1048576).toFixed(1).replace('.', ',')} MB · sin audio`,
    });
    setStatus(
      ext === 'webm'
        ? {
            text: 'Listo. Tu navegador grabó en WebM: Instagram lo acepta mejor en MP4, así que si lo rechaza, generalo desde Chrome reciente o Safari.',
            tone: 'ok',
          }
        : { text: 'Listo. El video está abajo.', tone: 'ok' },
    );
    recordingRef.current = false;
    setRecording(false);
    setTimeout(() => setProgress(0), 600);
  };

  if (allowed === null) return <p className="text-sm text-slate-500">Cargando...</p>;
  if (!allowed) {
    return (
      <div className="max-w-xl rounded-xl border border-slate-800 bg-slate-900 p-6">
        <p className="text-sm font-medium text-slate-200">Sin acceso</p>
        <p className="mt-1 text-sm text-slate-400">Esta herramienta es sólo para administradores de la plataforma.</p>
      </div>
    );
  }

  const [fw, fh] = SPOT_FORMATS[draft.format];
  const ar = fw / fh;
  const beatIndex = time < 1.8 ? 0 : time < 4.2 ? 1 : 2;

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Videos</h1>
        <p className="mt-1 text-sm text-slate-400">
          Escribí el mensaje, elegí la escena y generá un video publicitario de 6 segundos. Se arma en el navegador, no se guarda en ningún lado.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section aria-label="Vista previa" className="flex min-w-0 flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div
            className="mx-auto max-w-full overflow-hidden rounded-lg bg-[#13213F] shadow-2xl shadow-black/40"
            style={{ aspectRatio: String(ar), width: `min(100%, calc(64vh * ${ar.toFixed(4)}))` }}
          >
            <canvas ref={canvasRef} width={fw} height={fh} aria-label="Vista previa del anuncio" className="block h-full w-full" />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              disabled={recording}
              aria-label={playing ? 'Pausar' : 'Reproducir'}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            </button>
            <input
              type="range"
              min={0}
              max={600}
              step={1}
              value={Math.round(time * 100)}
              onChange={(e) => scrub(Number(e.target.value))}
              disabled={recording}
              aria-label="Posición en el video"
              className="min-w-0 flex-1 accent-indigo-500"
            />
            <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-400">{fmtT(time)} / 6,00 s</span>
          </div>

          <div className="grid grid-cols-[3fr_4fr_3fr] gap-1 sm:pl-12 sm:pr-[108px]">
            {SPOT_BEATS.map((beat, i) => (
              <div
                key={beat.label}
                className={`border-t-[3px] pt-1.5 text-xs leading-tight text-slate-500 ${i === beatIndex ? 'border-indigo-500' : 'border-slate-700'}`}
              >
                <b className="block text-[12.5px] font-semibold text-slate-200">{beat.label}</b>
                {fmtBeat(beat.from)} – {fmtBeat(beat.to)} s
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Configuración del anuncio" className="flex min-w-0 flex-col gap-5 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <fieldset className="flex flex-col gap-2" disabled={recording}>
            <legend className={`${LABEL_CLASS} mb-2`}>Formato</legend>
            <div className="grid grid-cols-3 gap-1.5">
              {FORMAT_OPTIONS.map((opt) => (
                <Segment key={opt.value} name="spot-format" checked={draft.format === opt.value} onChange={() => update({ format: opt.value })} {...opt} />
              ))}
            </div>
          </fieldset>

          <TextField field={TEXT_FIELDS[0]} value={draft.hook} disabled={recording} onChange={(v) => update({ hook: v })} />

          <fieldset className="flex flex-col gap-2" disabled={recording}>
            <legend className={`${LABEL_CLASS} mb-2`}>Escena de producto</legend>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-1.5">
              {SCENE_OPTIONS.map((opt) => (
                <Segment key={opt.value} name="spot-scene" checked={draft.scene === opt.value} onChange={() => changeScene(opt.value)} {...opt} />
              ))}
            </div>
          </fieldset>

          {TEXT_FIELDS.slice(1).map((field) => (
            <TextField key={field.key} field={field} value={draft[field.key]} disabled={recording} onChange={(v) => update({ [field.key]: v })} />
          ))}

          <div className="h-px bg-slate-800" />

          <button
            type="button"
            onClick={() => void generate()}
            disabled={recording}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {recording ? 'Grabando...' : 'Generar video de 6 s'}
          </button>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden>
            <div className="h-full bg-indigo-500 transition-[width] duration-100 ease-linear motion-reduce:transition-none" style={{ width: `${(progress * 100).toFixed(1)}%` }} />
          </div>
          <p
            role="status"
            className={`min-h-[1.2em] text-[13px] ${status.tone === 'ok' ? 'text-emerald-400' : status.tone === 'err' ? 'text-red-400' : 'text-slate-400'}`}
          >
            {status.text}
          </p>

          {result && (
            <div className="flex flex-col gap-3">
              <video src={result.url} controls loop muted playsInline autoPlay className="max-h-[360px] w-full rounded-lg bg-[#13213F]" />
              <p className="text-xs tabular-nums text-slate-500">{result.meta}</p>
              <a
                href={result.url}
                download={result.fileName}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
              >
                <Download className="h-4 w-4" aria-hidden />
                Descargar
              </a>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function fmtBeat(x: number): string {
  return String(x).replace('.', ',');
}

function Segment({
  name,
  label,
  hint,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="relative cursor-pointer">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="peer absolute inset-0 m-0 opacity-0" />
      <span
        className={`flex h-full flex-col items-center justify-center gap-px rounded-lg border px-1.5 py-2 text-center text-[13px] font-semibold leading-tight transition peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-disabled:opacity-50 ${
          checked ? 'border-indigo-500 bg-indigo-500/15 text-white' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
        }`}
      >
        {label}
        <small className="text-[11px] font-normal text-slate-500">{hint}</small>
      </span>
    </label>
  );
}

function TextField({
  field,
  value,
  disabled,
  onChange,
}: {
  field: (typeof TEXT_FIELDS)[number];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = `spot-${field.key}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={LABEL_CLASS}>
        {field.label}
      </label>
      <input
        id={id}
        type="text"
        maxLength={field.maxLength}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_CLASS} disabled:opacity-50`}
      />
      {field.hint && <span className="text-xs text-slate-500">{field.hint}</span>}
    </div>
  );
}
