import { INITIAL_STARTUP_VALUATION_STATE } from '../store/manual/startupValuationInitialState'

function pick(value: unknown, shape: unknown): unknown {
  if (value === null && shape === null) return null
  if (shape === null) return typeof value === 'number' && Number.isFinite(value) ? value : undefined
  if (typeof shape === 'number')
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
  if (typeof shape === 'string')
    return typeof value === 'string' ? value.slice(0, 10_000) : undefined
  if (typeof shape === 'boolean') return typeof value === 'boolean' ? value : undefined
  if (Array.isArray(shape)) {
    return Array.isArray(value)
      ? value
          .slice(0, 100)
          .map((item) => pick(item, shape[0]))
          .filter((item) => item !== undefined)
      : undefined
  }
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !shape ||
    typeof shape !== 'object'
  )
    return undefined
  const source = value as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(shape).flatMap(([key, template]) => {
      const selected = pick(source[key], template)
      return selected === undefined ? [] : [[key, selected]]
    })
  )
}

const evidenceShape = Object.fromEntries(
  Object.keys(INITIAL_STARTUP_VALUATION_STATE.founder_pedigree)
    .filter((key) => key !== 'solo_founder')
    .map((key) => [key, ''])
)
const studioShape = {
  ...INITIAL_STARTUP_VALUATION_STATE,
  exit_revenue_multiple_rationale: '',
  pedigree_evidence: evidenceShape,
  founder_pedigree: {
    ...INITIAL_STARTUP_VALUATION_STATE.founder_pedigree,
    pedigree_evidence: evidenceShape,
  },
  cap_table: {
    ...INITIAL_STARTUP_VALUATION_STATE.cap_table,
    safe_notes: [
      { id: '', amount: null, valuation_cap: null, discount_pct: null, holder_label: '' },
    ],
  },
  studio_v2: { description: '', evidence_notes: INITIAL_STARTUP_VALUATION_STATE.evidence_notes },
}
const identityShape = {
  company_name: '',
  country_code: '',
  kbo_number: '',
  legal_form: '',
  nace_code: '',
  nace_description: '',
  business_type_id: '',
  industry: '',
}

/** Named form fields only: no credentials, user identity, results or report assets. */
export function sanitizeLandingPayload(payload: {
  studio: Record<string, unknown>
  formData: Record<string, unknown>
}) {
  return {
    studio: pick(payload.studio, studioShape) as Record<string, unknown>,
    formData: pick(payload.formData, identityShape) as Record<string, unknown>,
  }
}
