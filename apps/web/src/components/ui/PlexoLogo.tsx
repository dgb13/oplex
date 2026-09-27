import { MARK_PATH } from './oplexMark';

const MARK_VIEWBOX = '229 229 573 378';
const MARK_ASPECT_RATIO = 573 / 378;

interface PlexoLogoProps {
  /** Icon HEIGHT in pixels - width follows the mark's real aspect ratio
   * (~1.51:1, it's a wide "P+∞" combination mark, not a square glyph) so it
   * never looks squashed/stretched. The wordmark's font-size scales off
   * this same number. Default matches the size the auth screens use. */
  size?: number;
  /** Icon-only, no "OPLEX" text - for tight spaces (mobile compact header,
   * anywhere the wordmark would wrap/crowd). */
  iconOnly?: boolean;
  /** Both the icon and the wordmark share ONE color (via currentColor) -
   * override this to place the mark on a background its default indigo
   * doesn't have enough contrast against (e.g. the auth screens' always-
   * dark decorative panel needs plain white, not indigo-600/dark:indigo-400
   * which assumes it's sitting on this app's normal light/dark page
   * background, not a fixed-dark panel). Defaults to this app's standard
   * brand color, same class already used for the wordmark everywhere else
   * (see AppShell.tsx). */
  colorClassName?: string;
  className?: string;
}

/**
 * The real brand mark - a "P" merging into an infinity symbol (∞) - as
 * given by the user (apps/web/public/logo.png is the reference lockup:
 * this same mark in a teal→green gradient, above the wordmark). The path
 * below is EXACTLY the letterform sub-path the user provided, with the
 * enclosing full-canvas rectangle stripped out: their original SVG was a
 * single compound path (rect + letterform, fill-rule="evenodd") meant as a
 * solid-tile app icon (rect fills solid, letterform punches through as a
 * cutout - see apps/web/src/app/icon.svg, which now uses that full version
 * as the favicon). Isolating just the letterform sub-path and filling IT
 * directly (confirmed by rendering both ways side by side) gives a clean
 * solid glyph on a transparent background instead - the right shape for
 * sitting inline next to the "OPLEX" wordmark in a header, not a favicon
 * tile.
 *
 * Recolored via currentColor (the source path was a fixed navy, matching
 * the wordmark color in logo.png) so it inherits whatever indigo-600/
 * indigo-400 (light/dark) the caller sets - same brand color used
 * everywhere else in this app's UI (see AppShell.tsx).
 */
export function PlexoLogo({
  size = 28,
  iconOnly = false,
  colorClassName = 'text-indigo-600 dark:text-indigo-400',
  className = '',
}: PlexoLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${colorClassName} ${className}`}>
      <svg
        height={size}
        width={size * MARK_ASPECT_RATIO}
        viewBox={MARK_VIEWBOX}
        aria-hidden={!iconOnly}
        role={iconOnly ? 'img' : undefined}
        aria-label={iconOnly ? 'Oplex' : undefined}
      >
        <path d={MARK_PATH} fill="currentColor" fillRule="evenodd" />
      </svg>
      {!iconOnly && (
        <span className="font-bold tracking-tight" style={{ fontSize: size * 0.75 }}>
          OPLEX
        </span>
      )}
    </span>
  );
}
