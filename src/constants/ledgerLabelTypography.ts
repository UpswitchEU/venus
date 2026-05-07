/**
 * Shared typography for grootboek accounts, CSV/Yuki descriptions, and normalization copy.
 *
 * Parent flex/grid items must include **`min-w-0`** (or `min-w-[0]` in grids) so wrapping can take effect.
 *
 * `[overflow-wrap:anywhere]` avoids horizontal overflow from occasional long unbroken tokens.
 *
 * Convention & regression: `.cursor/rules/ledger-label-typography.mdc`,
 * `constants/__tests__/ledgerLabelTypography.test.ts`. Mercury mirrors this string in
 * `apps/mercury/shared/constants/ledgerLabelTypography.ts` — keep in sync when changing.
 */
export const LEDGER_LABEL_TEXT_CLASSES =
  'break-words whitespace-normal leading-snug [overflow-wrap:anywhere]' as const
