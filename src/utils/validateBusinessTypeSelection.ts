/**
 * Guards against stale business_type_id after the user changes sector in the form.
 */

const FINTECH_MARKERS = ['fintech', 'lending', 'credit', '64.92', 'krediet']
const ACCOUNTING_MARKERS = ['accounting', 'bookkeeping', 'boekhoud', 'cpa']

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function matchesAny(haystack: string, markers: string[]): boolean {
  const normalized = normalize(haystack)
  return markers.some((marker) => normalized.includes(marker))
}

export function validateBusinessTypeSelection(args: {
  businessTypeId: string
  businessTypeTitle?: string | null
  industry?: string | null
}): string | null {
  const id = normalize(args.businessTypeId)
  const label = normalize(
    [args.businessTypeTitle, args.industry].filter(Boolean).join(' ') || args.businessTypeId
  )

  const labelLooksFintech = matchesAny(label, FINTECH_MARKERS)
  const idLooksAccounting = id === 'accounting' || matchesAny(id, ACCOUNTING_MARKERS)

  if (labelLooksFintech && idLooksAccounting) {
    return 'Het geselecteerde bedrijfstype komt niet overeen met Fintech — kies het type opnieuw in stap 1.'
  }

  const labelLooksAccounting = matchesAny(label, ACCOUNTING_MARKERS)
  const idLooksFintech = id.includes('fintech') || id.includes('lending')

  if (labelLooksAccounting && idLooksFintech) {
    return 'Het geselecteerde bedrijfstype komt niet overeen met boekhouding — kies het type opnieuw in stap 1.'
  }

  return null
}
