import { mapLegalFormToBusinessStructure } from './legalFormMapping'

const STRUCTURE_TO_LABEL: Record<string, string> = {
  bv: 'BV',
  nv: 'NV',
  vof: 'VOF',
  cvba: 'CVBA',
  vzw: 'VZW',
  eenmanszaak: 'Eenmanszaak',
}

function cleanPart(value?: string | null): string {
  const trimmed = String(value ?? '')
    .trim()
    .replace(/[,;.\s]+$/g, '')
  if (!trimmed || trimmed === '—') return ''
  return trimmed
}

/**
 * Prefer a short registry label (BV, NV, …) over truncated DB long forms.
 * Returns `{ label, title }` where `title` holds the raw value when abbreviated.
 */
export function formatLegalFormLabel(legalForm?: string | null): {
  label: string
  title?: string
} {
  const raw = cleanPart(legalForm)
  if (!raw) return { label: '' }

  const mapped = mapLegalFormToBusinessStructure(raw)
  if (mapped) {
    const shortLabel = STRUCTURE_TO_LABEL[mapped] ?? mapped.toUpperCase()
    if (shortLabel.toLowerCase() !== raw.toLowerCase()) {
      return { label: shortLabel, title: raw }
    }
    return { label: shortLabel }
  }

  if (raw.length <= 12) return { label: raw }
  return { label: `${raw.slice(0, 12).trim()}…`, title: raw }
}

/** Prefer activity label over legacy nace description when both exist. */
export function getRegistryActivityDescription(input: {
  activityLabel?: string | null
  naceDescription?: string | null
}): string {
  return cleanPart(input.activityLabel) || cleanPart(input.naceDescription)
}

/** Format Belgian KBO or Dutch KVK number for display. */
export function formatRegistryNumber(raw: string, countryCode = 'BE'): string {
  const digits = raw.replace(/\D/g, '')
  const country = countryCode.trim().toUpperCase().slice(0, 2)
  if (country === 'NL') {
    return digits.length === 8 ? digits : raw
  }
  if (digits.length !== 10) return raw
  return `${digits.slice(0, 4)}.${digits.slice(4, 7)}.${digits.slice(7, 10)}`
}

export interface RegistryCompanyLocationInput {
  address?: string | null
  postalCode?: string | null
  city?: string | null
}

/**
 * Build a single location line, skipping empty parts and avoiding duplicate
 * postal/city when they already appear in the address string.
 */
export function formatRegistryCompanyLocation({
  address,
  postalCode,
  city,
}: RegistryCompanyLocationInput): string {
  const addr = cleanPart(address)
  const postal = cleanPart(postalCode)
  const cityPart = cleanPart(city)

  const parts: string[] = []

  if (addr) {
    parts.push(addr)
  }

  const postalCity = [postal, cityPart].filter(Boolean).join(' ')
  if (postalCity) {
    const addrLower = addr.toLowerCase()
    const postalLower = postal.toLowerCase()
    const cityLower = cityPart.toLowerCase()

    const postalInAddr = postal ? addrLower.includes(postalLower) : false
    const cityInAddr = cityPart ? addrLower.includes(cityLower) : false

    if (!postalInAddr && !cityInAddr) {
      parts.push(postalCity)
    } else if (cityPart && !cityInAddr) {
      parts.push(cityPart)
    } else if (postal && !postalInAddr) {
      parts.push(postal)
    }
  }

  return parts.join(', ')
}

/** Merge companyInfo / kboData address parts from bootstrap prefill. */
export function formatBootstrapCompanyAddress(
  info?: RegistryCompanyLocationInput | null,
  fallback?: RegistryCompanyLocationInput | null
): string {
  const primary = formatRegistryCompanyLocation({
    address: info?.address,
    postalCode: info?.postalCode,
    city: info?.city,
  })
  if (primary) return primary
  return formatRegistryCompanyLocation({
    address: fallback?.address,
    postalCode: fallback?.postalCode,
    city: fallback?.city,
  })
}
