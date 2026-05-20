import type { User } from '../../contexts/AuthContextTypes'

function getIndustry(user: User): string {
  if (user.industry) return user.industry

  const businessTypeToIndustry: Record<string, string> = {
    restaurant: 'hospitality',
    saas: 'technology',
    software: 'technology',
    ecommerce: 'retail',
    retail: 'retail',
    consulting: 'services',
  }

  return businessTypeToIndustry[user.business_type?.toLowerCase() || ''] || 'services'
}

function resolveBusinessCardCountry(user: User): string {
  const candidates = [user.firm_country_code, user.country]
  for (const candidate of candidates) {
    const normalized = candidate?.trim().toUpperCase()
    if (normalized === 'BE' || normalized === 'NL') {
      return normalized
    }
  }

  return 'BE'
}

function parseEmployeeCount(range?: string): number | undefined {
  if (!range) return undefined

  const normalized = range.trim().toLowerCase()
  const rangeMap: Record<string, number> = {
    '1-10': 5,
    '10-50': 25,
    '11-25': 18,
    '26-50': 38,
    '50-100': 75,
    '51-100': 75,
    '100-500': 250,
    '101-500': 250,
    '500+': 750,
    '500-1000': 750,
    '1000+': 1500,
  }

  if (rangeMap[normalized]) {
    return rangeMap[normalized]
  }

  const match = normalized.match(/(\d+)-(\d+)/)
  if (match) {
    const min = parseInt(match[1])
    const max = parseInt(match[2])
    return Math.floor((min + max) / 2)
  }

  const openMatch = normalized.match(/(\d+)\+/)
  if (openMatch) {
    const min = parseInt(openMatch[1])
    return Math.floor(min * 1.5)
  }

  return undefined
}

export function buildBusinessCard(user: User | null) {
  if (!user || !(user.company_name || user.business_type || user.industry)) {
    return null
  }

  return {
    company_name: user.company_name || 'Your Company',
    industry: getIndustry(user),
    business_model: user.business_type || 'other',
    founding_year: user.founded_year || new Date().getFullYear() - (user.years_in_operation || 5),
    country_code: resolveBusinessCardCountry(user),
    employee_count: parseEmployeeCount(user.employee_count_range),
    kbo_number: user.kbo_number,
    vat_number: user.vat_number,
    city: user.city,
    postal_code: user.postal_code,
    legal_form: user.legal_form,
    nace_code: user.nace_code,
    nace_description: user.nace_description,
  }
}
