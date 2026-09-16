'use client';

/** Glow ambiental de fondo, en toda la app - nació en el módulo "Resumen"
 * (pedido explícito del usuario tras ver el boceto) y después se extendió
 * a pedido suyo a todas las pantallas ("aplicalo a toda la app, no sólo
 * Resumen"). Se monta una sola vez en AppShell.tsx así lo hereda cualquier
 * pantalla que use ese shell (POS queda cubierto igual: pinta su propio
 * fondo opaco sobre el área de contenido, tapando el glow ahí a propósito).
 * `motion-safe:` ya respeta prefers-reduced-motion por su cuenta (Tailwind
 * sólo aplica esa clase dentro de esa media query). */
export default function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -top-[18vw] -right-[10vw] h-[46vw] w-[46vw] rounded-full bg-primary opacity-[0.10] blur-[90px] motion-safe:animate-[ambient-drift-1_26s_ease-in-out_infinite] dark:opacity-[0.30]" />
      <div className="absolute -bottom-[14vw] -left-[8vw] h-[34vw] w-[34vw] rounded-full bg-chart-2 opacity-[0.07] blur-[90px] motion-safe:animate-[ambient-drift-2_32s_ease-in-out_infinite] dark:opacity-[0.15]" />
    </div>
  );
}
