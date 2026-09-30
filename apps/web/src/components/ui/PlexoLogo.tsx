import {
  BRAND_ORANGE,
  LOCKUP_MARK_SCALE,
  LOCKUP_VIEWBOX,
  MARK_ARC_PATH,
  MARK_ARC_STROKE_WIDTH,
  MARK_DOT,
  MARK_VIEWBOX,
  WORDMARK_PATH,
  WORDMARK_TRANSLATE,
} from './oplexMark';

const LOCKUP_ASPECT_RATIO = 387.05 / 93;

interface PlexoLogoProps {
  /** Alto en píxeles - el ancho sale de la proporción real del logo (el
   * horizontal es ~4,2:1, el isotipo solo es cuadrado), nunca se deforma.
   * BRAND.md: mínimo 24 px de alto el horizontal, 16 px el isotipo. */
  size?: number;
  /** Sólo el isotipo (arco + punto), sin "oplex" - para lugares chicos
   * (riel del menú colapsado, header compacto en celular). */
  iconOnly?: boolean;
  /** Color del arco y del texto (vía currentColor). El default es el índigo
   * de la app; sobre un fondo oscuro fijo (barra lateral, panel del login,
   * backoffice) se pasa blanco - la versión "negativo" de BRAND.md. El
   * punto es siempre naranja de marca. */
  colorClassName?: string;
  className?: string;
}

/**
 * Logo de Oplex (nuevo sistema de marca, docs/logo/oplex-brand/BRAND.md):
 * isotipo = arco + punto naranja, logotipo = "oplex" en trazos. Geometría
 * tal cual los SVG oficiales (ver oplexMark.ts); colores: decisión del
 * usuario (2026-09-30) de mantener el índigo de la app para el arco y el
 * texto, con el punto en el naranja de marca.
 */
export function PlexoLogo({
  size = 28,
  iconOnly = false,
  colorClassName = 'text-indigo-600 dark:text-indigo-400',
  className = '',
}: PlexoLogoProps) {
  const mark = (
    <>
      <path
        d={MARK_ARC_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth={MARK_ARC_STROKE_WIDTH}
        strokeLinecap="round"
      />
      <circle cx={MARK_DOT.cx} cy={MARK_DOT.cy} r={MARK_DOT.r} fill={BRAND_ORANGE} />
    </>
  );

  return (
    <span className={`inline-flex items-center ${colorClassName} ${className}`}>
      {iconOnly ? (
        <svg height={size} width={size} viewBox={MARK_VIEWBOX} role="img" aria-label="Oplex">
          {mark}
        </svg>
      ) : (
        <svg height={size} width={size * LOCKUP_ASPECT_RATIO} viewBox={LOCKUP_VIEWBOX} role="img" aria-label="Oplex">
          <g transform={`scale(${LOCKUP_MARK_SCALE})`}>{mark}</g>
          <path
            transform={`translate(${WORDMARK_TRANSLATE.x} ${WORDMARK_TRANSLATE.y})`}
            fill="currentColor"
            d={WORDMARK_PATH}
          />
        </svg>
      )}
    </span>
  );
}
