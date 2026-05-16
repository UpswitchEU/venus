import { dcfManualInputAdapter } from './dcf/manualInputAdapter'
import type { MethodKey } from './types'

export const MANUAL_INPUT_METHOD_ADAPTERS = Object.freeze({
  [dcfManualInputAdapter.key]: dcfManualInputAdapter,
})

export type RegisteredManualInputMethodKey = keyof typeof MANUAL_INPUT_METHOD_ADAPTERS
export type RegisteredManualInputMethodAdapter =
  (typeof MANUAL_INPUT_METHOD_ADAPTERS)[RegisteredManualInputMethodKey]

export function getManualInputMethodAdapter(
  key: MethodKey
): RegisteredManualInputMethodAdapter | undefined {
  return MANUAL_INPUT_METHOD_ADAPTERS[key as RegisteredManualInputMethodKey]
}

export function getRequiredManualInputMethodAdapter(
  key: RegisteredManualInputMethodKey
): RegisteredManualInputMethodAdapter {
  return MANUAL_INPUT_METHOD_ADAPTERS[key]
}
