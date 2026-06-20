import * as React from 'react'

export type AuroraFieldVisualState = 'default' | 'focus' | 'error' | 'success' | 'disabled'

export interface FieldVisualStateInput {
  disabled?: boolean
  hasError: boolean
  isFocused: boolean
  success?: boolean
}

export function hasVisibleFieldError(error?: string, touched?: boolean): boolean {
  return Boolean(error && touched)
}

export function deriveFieldVisualState({
  disabled,
  hasError,
  isFocused,
  success,
}: FieldVisualStateInput): AuroraFieldVisualState {
  if (disabled) return 'disabled'
  if (hasError) return 'error'
  if (success) return 'success'
  if (isFocused) return 'focus'
  return 'default'
}

export function deriveHasFieldValue({
  defaultValue,
  elementValue,
  value,
}: {
  defaultValue?: unknown
  elementValue?: string | null
  value?: unknown
}): boolean {
  if (value !== undefined) return Boolean(value)
  if (elementValue != null) return Boolean(elementValue)
  if (defaultValue !== undefined) return Boolean(defaultValue)
  return false
}

export function getFieldErrorId(fieldId?: string): string | undefined {
  return fieldId ? `${fieldId}-error` : undefined
}

export function useFieldErrorShake(hasError: boolean): boolean {
  const [shouldShake, setShouldShake] = React.useState(false)

  React.useEffect(() => {
    if (!hasError) return
    setShouldShake(true)
    const timer = setTimeout(() => setShouldShake(false), 500)
    return () => clearTimeout(timer)
  }, [hasError])

  return shouldShake
}
