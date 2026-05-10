'use client'

/**
 * XMultiplierInput — explicit "× multiplier" input control.
 *
 * Wraps ``AuroraInput`` with a trailing ``×`` glyph so ROI / hurdle
 * inputs (e.g. "30×") look unambiguously like multipliers and not like
 * percentages.
 *
 * **Why this exists (audit issue #10, 2026-05-10):**
 *   The startup wizard previously reused ``AdaptivePercentInput`` for
 *   target-ROI and exit-EV/Revenue multiples.  Technically correct (the
 *   component never renders a `%` glyph), but the function name + the
 *   sibling-of-percent rhythm in `ExitStoryStep` signalled the wrong
 *   unit.  Founders typing "30" would mean "30×" but think they were
 *   entering "30%".
 *
 *   An explicit ``×`` suffix erases that ambiguity at zero accuracy
 *   cost — same decimal-text parsing pipeline (`useDecimalTextInputState`)
 *   as the percent variant.
 *
 * **Locale:** the underlying parser accepts both NL (`,` decimal) and
 * EN (`.` decimal) input.  No locale-specific code lives here — it's
 * inherited from `useDecimalTextInputState`.
 *
 * Used by:
 *   - ``ExitStoryStep`` — target-ROI and exit-EV/Revenue multiple
 *
 * Test: ``XMultiplierInput.test.tsx``.
 */

import { AuroraInput } from '@/design-system/components/Input'
import { useDecimalTextInputState } from '@/hooks/useDecimalTextInputState'

export interface XMultiplierInputProps {
  /** Floating label rendered above the input. */
  label: string
  /** Current numeric value; ``undefined`` clears the input. */
  value?: number
  /** Fired with the parsed number, or ``undefined`` when the input is empty. */
  onChange: (value: number | undefined) => void
  /** Placeholder text when the input is empty. */
  placeholder?: string
  /** Description rendered below the input — used for engine-default hints. */
  description?: string
}

export function XMultiplierInput({
  label,
  value,
  onChange,
  placeholder,
  description,
}: XMultiplierInputProps) {
  const {
    display,
    onFocus,
    onBlur,
    onChange: onDecChange,
  } = useDecimalTextInputState(value, onChange, {})
  return (
    <AuroraInput
      label={label}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      size="sm"
      value={display}
      onChange={onDecChange}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      description={description}
      truncateLabel={false}
      rightIcon={
        <span
          aria-hidden
          className="select-none text-[13px] font-semibold tabular-nums text-foreground/55"
        >
          ×
        </span>
      }
      className="tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  )
}

export default XMultiplierInput
