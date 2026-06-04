/**
 * Method selector dropdown — layout & interaction tokens.
 *
 * Per-method info icons use Aurora-style ghost + ring focus
 * (see `design-system/components/Button.tsx`) without Framer Motion so tooltip
 * triggers stay predictable inside popovers. Section rules use muted text only.
 *
 * Related: `methodFieldConfig.ts` (which methods exist), `constants/methodLabels.ts`
 * (i18n key paths), and locale JSON under `manualInput.methodSelector` (copy).
 */

import { cn } from '@/design-system/utils'

/** Tooltip surface above glass dropdowns (`z-50`). */
export const methodSelectorTooltipSurfaceClass = 'z-[200] max-w-sm'

/** Readable body copy inside tooltips. */
export const methodSelectorTooltipBodyClass =
  'max-w-sm whitespace-normal text-left text-sm font-normal leading-snug'

const iconButtonBase = cn(
  'inline-flex min-h-[44px] min-w-[44px] shrink-0 touch-manipulation items-center justify-center rounded-md',
  'bg-transparent text-foreground/50',
  'hover:bg-foreground/[0.06] hover:text-foreground/80',
  'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-primary/40'
)

/** Info control beside a method row (stretches to row height). */
export const methodSelectorRowInfoButtonClass = cn(iconButtonBase, 'self-stretch')

/** Muted helper lines under section titles (combinable / standalone rules). */
export const methodSelectorSectionHelperClass =
  'space-y-1 px-2 pb-1.5 text-[10px] font-normal leading-snug text-foreground/35'

export const methodSelectorSectionHelperSecondaryClass = 'text-foreground/30'

/** Static section titles (e.g. “Aanbevolen”, “Markt & inkomen”). */
export const methodSelectorStaticSectionTitleClass =
  'text-[11px] text-foreground/40 uppercase tracking-wider font-medium px-2 py-1'

export const methodSelectorListboxClass = 'p-1.5 w-[min(20rem,calc(100vw-1.5rem))]'

export const methodSelectorDividerClass = 'h-px bg-foreground/[0.06] my-1.5'
