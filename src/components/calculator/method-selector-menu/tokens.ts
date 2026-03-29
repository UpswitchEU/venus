/**
 * Method selector dropdown — layout & interaction tokens.
 *
 * Icon buttons mirror Aurora `Button` ghost emphasis + ring focus
 * (see `design-system/components/Button.tsx`) without Framer Motion so tooltip
 * triggers stay predictable inside popovers.
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

/** Info control in section headers (combinable / standalone). */
export const methodSelectorSectionInfoButtonClass = iconButtonBase

/** Info control beside a method row (stretches to row height). */
export const methodSelectorRowInfoButtonClass = cn(iconButtonBase, 'self-stretch')

export const methodSelectorSectionHeadingRowClass = 'flex min-h-[44px] items-center gap-1 px-2 py-0.5'

export const methodSelectorSectionHeadingTextClass =
  'min-w-0 flex-1 text-[11px] text-foreground/40 uppercase tracking-wider font-medium'

/** Static section titles (e.g. “Aanbevolen”) without the info column. */
export const methodSelectorStaticSectionTitleClass =
  'text-[11px] text-foreground/40 uppercase tracking-wider font-medium px-2 py-1'

export const methodSelectorListboxClass = 'p-1.5 w-80'

export const methodSelectorDividerClass = 'h-px bg-foreground/[0.06] my-1.5'
