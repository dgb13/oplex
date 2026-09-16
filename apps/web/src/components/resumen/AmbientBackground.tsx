'use client';

/** Glow ambiental de fondo para el módulo "Resumen" - pedido explícito del
 * usuario tras ver el boceto ("me gustó mucho el fondo degradado... me
 * gustaría que esté en las demás categorías"). Se monta una sola vez en
 * resumen/layout.tsx así lo heredan todas las categorías, no sólo la de
 * Resumen. `motion-safe:` ya respeta prefers-reduced-motion por su cuenta
 * (Tailwind sólo aplica esa clase dentro de esa media query). */
export default function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -top-[18vw] -right-[10vw] h-[46vw] w-[46vw] rounded-full bg-primary opacity-[0.10] blur-[90px] motion-safe:animate-[resumen-drift-1_26s_ease-in-out_infinite] dark:opacity-[0.30]" />
      <div className="absolute -bottom-[14vw] -left-[8vw] h-[34vw] w-[34vw] rounded-full bg-chart-2 opacity-[0.07] blur-[90px] motion-safe:animate-[resumen-drift-2_32s_ease-in-out_infinite] dark:opacity-[0.15]" />
    </div>
  );
}
