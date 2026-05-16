import { dcfManualInputAdapter } from './dcf/manualInputAdapter'
import { sdeManualInputAdapter } from './sde_multiple/manualInputAdapter'
import type { MethodKey } from './types'

export const MANUAL_INPUT_METHOD_ADAPTERS = Object.freeze({
  [dcfManualInputAdapter.key]: dcfManualInputAdapter,
  [sdeManualInputAdapter.key]: sdeManualInputAdapter,
})

export type RegisteredManualInputMethodKey = keyof typeof MANUAL_INPUT_METHOD_ADAPTERS
export type RegisteredManualInputMethodAdapter =
  (typeof MANUAL_INPUT_METHOD_ADAPTERS)[RegisteredManualInputMethodKey]

export function getManualInputMethodAdapter(
  key: MethodKey
): RegisteredManualInputMethodAdapter | undefined {
  return MANUAL_INPUT_METHOD_ADAPTERS[key as RegisteredManualInputMethodKey]
}

export function getRequiredManualInputMethodAdapter<K extends RegisteredManualInputMethodKey>(
  key: K
): (typeof MANUAL_INPUT_METHOD_ADAPTERS)[K] {
  return MANUAL_INPUT_METHOD_ADAPTERS[key]
}
