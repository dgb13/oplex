'use client';

import { initials } from '@/lib/profile';
import { useEffect, useRef } from 'react';

export interface LeaderboardPerson {
  id: string;
  /** Nombre a mostrar, ya resuelto (nombre real o email de fallback) */
  name: string;
  avatarUrl: string | null;
  /** Valor crudo, para calcular el ancho relativo de la barra */
  amount: number;
  /** Ya formateado para mostrar, ej. "$ 6,82M" */
  amountLabel: string;
  /** Ej. "52 facturas" */
  sub: string;
}

const AVATAR_HUES = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'];

/** Ranking de personas con avatar (foto o iniciales) - "Vendedores" en
 * Ventas, "Compradores" en Compras. El #1 se corona y su avatar queda
 * resaltado, pedido explícito del usuario después de ver el boceto. */
export default function Leaderboard({ people }: { people: LeaderboardPerson[] }) {
  if (people.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">Sin actividad en el período.</p>;
  }

  const max = Math.max(...people.map((p) => p.amount)) || 1;

  return (
    <div className="flex flex-col">
      {people.map((person, i) => (
        <LeaderboardRow key={person.id} person={person} rank={i + 1} pct={(person.amount / max) * 100} delay={i * 90} />
      ))}
    </div>
  );
}

function LeaderboardRow({
  person,
  rank,
  pct,
  delay,
}: {
  person: LeaderboardPerson;
  rank: number;
  pct: number;
  delay: number;
}) {
  const fillRef = useRef<HTMLDivElement>(null);
  const hue = AVATAR_HUES[(rank - 1) % AVATAR_HUES.length];

  useEffect(() => {
    const el = fillRef.current;
    if (!el) return;
    const timer = setTimeout(() => {
      el.style.width = `${pct}%`;
    }, delay + 120);
    return () => clearTimeout(timer);
  }, [pct, delay]);

  return (
    <div className="flex items-center gap-3 border-t py-2.5 first:border-t-0 first:pt-0.5">
      <span className={`w-4 shrink-0 text-center font-mono text-xs font-bold ${rank === 1 ? 'text-chart-3' : 'text-muted-foreground'}`}>
        {rank}
      </span>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-white ring-2 ring-card ${
          rank === 1 ? 'ring-4 ring-chart-3/50' : ''
        } ${person.avatarUrl ? '' : hue}`}
      >
        {person.avatarUrl ? (
          // Avatar subido por el propio usuario (dominio arbitrario) - mismo
          // criterio que AppShell.tsx (menú de usuario), un <img> normal en
          // vez de next/image no vale la pena el whitelisting de dominios.
          <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initials(person.name, person.name)
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-1.5 truncate text-xs font-semibold">
          <span className="truncate">{person.name}</span>
          {rank === 1 && <span aria-hidden="true">👑</span>}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div ref={fillRef} className={`h-full w-0 rounded-full transition-[width] duration-1000 ease-out ${hue}`} />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-xs font-bold tabular-nums">{person.amountLabel}</div>
        <div className="text-[10.5px] text-muted-foreground">{person.sub}</div>
      </div>
    </div>
  );
}
