import { useEffect, useState } from 'react';

/** Cuenta de 0 al valor final con un ease-out propio (sin react-countup -
 * son ~15 líneas, no justifica una dependencia nueva). Reinicia sólo si
 * `active` pasa a false; si el valor objetivo cambia con `active` ya en
 * true (llegó un snapshot nuevo), vuelve a animar desde 0 hasta el valor
 * nuevo - "algo cambió" es información, no un glitch.
 *
 * Extraído de dashboard/page.tsx (Tablero) para reusarlo en "Resumen" sin
 * duplicarlo - primer beneficiario real de sacarlo de ahí. */
export function useCountUp(target: number, active: boolean, duration = 1100): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) {
      setValue(0);
      return undefined;
    }
    let frame: number;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, target, duration]);
  return value;
}
