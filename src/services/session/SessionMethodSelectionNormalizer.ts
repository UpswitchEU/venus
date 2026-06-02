import {
  SESSION_PRE_SELECTED_METHODS_KEY,
  SESSION_PRE_SELECTED_VALUATION_METHOD_ALT_KEY,
  SESSION_PRE_SELECTED_VALUATION_METHOD_KEY,
  SESSION_USER_WEIGHT_JUSTIFICATION_KEY,
  SESSION_USER_WEIGHTS_KEY,
} from '../../constants/sessionUiKeys'

type SessionRecord = Record<string, unknown>

export interface SessionMethodSelectionHints {
  preSelectedValuationMethod: string | null | undefined
  preSelectedMethods: string[] | undefined
  userWeights: Record<string, number> | undefined
  userWeightJustification: string | undefined
}

function pickStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  return raw.every((method: unknown) => typeof method === 'string') ? raw : undefined
}

function normalizeWeightMapForUi(record: Record<string, number>): Record<string, number> {
  const values = Object.values(record)
  const total = values.reduce((sum, value) => sum + value, 0)
  const looksFractional =
    values.length > 0 && values.every((value) => value >= 0 && value <= 1) && total <= 1.05
  if (!looksFractional) return record
  return Object.fromEntries(
    Object.entries(record).map(([method, weight]) => [method, weight * 100])
  )
}

function pickWeightMap(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const record = raw as Record<string, number>
  return Object.keys(record).length > 0 ? normalizeWeightMapForUi(record) : undefined
}

function extractSingleMethodHint(sessionData: SessionRecord): string | null | undefined {
  const hasLegacySinglePreKey =
    SESSION_PRE_SELECTED_VALUATION_METHOD_KEY in sessionData ||
    SESSION_PRE_SELECTED_VALUATION_METHOD_ALT_KEY in sessionData

  const rawPreLegacy = hasLegacySinglePreKey
    ? SESSION_PRE_SELECTED_VALUATION_METHOD_KEY in sessionData
      ? sessionData[SESSION_PRE_SELECTED_VALUATION_METHOD_KEY]
      : sessionData[SESSION_PRE_SELECTED_VALUATION_METHOD_ALT_KEY]
    : undefined

  const rawSelectedMethodFlat =
    typeof sessionData.selected_method === 'string' ? sessionData.selected_method : undefined

  const rawPre: unknown = rawPreLegacy !== undefined ? rawPreLegacy : rawSelectedMethodFlat
  const hasAnySingleMethodHint =
    hasLegacySinglePreKey ||
    (rawSelectedMethodFlat !== undefined && typeof rawSelectedMethodFlat === 'string')

  if (!hasAnySingleMethodHint) return undefined
  if (rawPre === null || rawPre === '') return null
  if (typeof rawPre === 'string' && rawPre.trim().length > 0) return rawPre.trim().toLowerCase()
  return undefined
}

export function extractMethodSelectionHints(
  sessionData: SessionRecord
): SessionMethodSelectionHints {
  const preSelectedMethods =
    pickStringArray(sessionData[SESSION_PRE_SELECTED_METHODS_KEY]) ??
    pickStringArray(sessionData.pre_selected_valuation_methods) ??
    pickStringArray(sessionData.selected_methods) ??
    pickStringArray(sessionData.methods)

  const userWeights =
    pickWeightMap(sessionData[SESSION_USER_WEIGHTS_KEY]) ??
    pickWeightMap(sessionData.user_weights) ??
    pickWeightMap(sessionData.userWeights)

  const rawJustificationUnderscore = sessionData[SESSION_USER_WEIGHT_JUSTIFICATION_KEY]
  const rawJustificationSnake = sessionData.user_weight_justification
  const userWeightJustification =
    typeof rawJustificationUnderscore === 'string'
      ? rawJustificationUnderscore
      : typeof rawJustificationSnake === 'string'
        ? rawJustificationSnake
        : undefined

  return {
    preSelectedValuationMethod: extractSingleMethodHint(sessionData),
    preSelectedMethods,
    userWeights,
    userWeightJustification,
  }
}
