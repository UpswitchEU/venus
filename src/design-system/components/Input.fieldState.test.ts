import { describe, expect, it } from 'vitest'
import {
  deriveFieldVisualState,
  deriveHasFieldValue,
  getFieldErrorId,
  hasVisibleFieldError,
} from './Input.fieldState'

describe('Aurora input field state helpers', () => {
  it('prioritizes disabled and visible errors over success and focus', () => {
    expect(
      deriveFieldVisualState({
        disabled: true,
        hasError: true,
        isFocused: true,
        success: true,
      })
    ).toBe('disabled')

    expect(
      deriveFieldVisualState({
        hasError: true,
        isFocused: true,
        success: true,
      })
    ).toBe('error')
  })

  it('falls through to success, focus, then default', () => {
    expect(deriveFieldVisualState({ hasError: false, isFocused: true, success: true })).toBe(
      'success'
    )
    expect(deriveFieldVisualState({ hasError: false, isFocused: true })).toBe('focus')
    expect(deriveFieldVisualState({ hasError: false, isFocused: false })).toBe('default')
  })

  it('keeps controlled value precedence when deriving whether the field has content', () => {
    expect(deriveHasFieldValue({ value: 0, defaultValue: 'fallback', elementValue: 'dom' })).toBe(
      false
    )
    expect(deriveHasFieldValue({ defaultValue: '', elementValue: 'dom' })).toBe(true)
    expect(deriveHasFieldValue({ defaultValue: 'fallback' })).toBe(true)
    expect(deriveHasFieldValue({})).toBe(false)
  })

  it('shows errors only after touch and omits anonymous error ids', () => {
    expect(hasVisibleFieldError('Required', false)).toBe(false)
    expect(hasVisibleFieldError('Required', true)).toBe(true)
    expect(getFieldErrorId('company-name')).toBe('company-name-error')
    expect(getFieldErrorId()).toBeUndefined()
  })
})
