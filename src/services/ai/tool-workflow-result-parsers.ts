import type {
  BusinessTypeSearchResult,
  BusinessTypeSearchResults,
  ListingCreateRequest,
  ListingCreateRequestPending,
  RegistrySearchHit,
  RegistrySearchResults,
  ReportGenerationRequest,
  ReportGenerationRequestPending,
  SellabilityRunRequest,
  SellabilityRunRequestPending,
  ValuationRunRequest,
  ValuationRunRequestPending,
} from './tool-result-types'

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

export function parseValuationRunRequest(data: unknown): ValuationRunRequest[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  const status = d.status
  if (status === 'pending_approval' && d.request && typeof d.request === 'object') {
    const req = d.request as Record<string, unknown>
    return [
      {
        status: 'pending_approval',
        reportId: typeof req.report_id === 'string' ? req.report_id : undefined,
        methods: Array.isArray(req.methods) ? (req.methods as string[]) : null,
        estimatedCredits:
          typeof req.estimated_credits === 'number' ? req.estimated_credits : undefined,
        inputsSummary: req.inputs_summary as ValuationRunRequestPending['inputsSummary'],
        note: (req.note as string | null | undefined) ?? null,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }
  if (status === 'blocked') {
    return [
      {
        status: 'blocked',
        reason: typeof d.reason === 'string' ? d.reason : undefined,
        missing: Array.isArray(d.missing) ? (d.missing as string[]) : undefined,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }
  return []
}

export function parseReportGenerationRequest(data: unknown): ReportGenerationRequest[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  const status = d.status
  if (status === 'pending_approval' && d.request && typeof d.request === 'object') {
    const req = d.request as Record<string, unknown>
    return [
      {
        status: 'pending_approval',
        reportId: typeof req.report_id === 'string' ? req.report_id : undefined,
        estimatedCredits:
          typeof req.estimated_credits === 'number' ? req.estimated_credits : undefined,
        resultSummary: req.result_summary as ReportGenerationRequestPending['resultSummary'],
        note: (req.note as string | null | undefined) ?? null,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }
  if (status === 'blocked') {
    return [
      {
        status: 'blocked',
        reason: typeof d.reason === 'string' ? d.reason : undefined,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }
  return []
}

export function parseSellabilityRunRequest(data: unknown): SellabilityRunRequest[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  const status = d.status
  if (status === 'pending_approval' && d.request && typeof d.request === 'object') {
    const req = d.request as Record<string, unknown>
    return [
      {
        status: 'pending_approval',
        estimatedCredits:
          typeof req.estimated_credits === 'number' ? req.estimated_credits : undefined,
        answers: req.answers as SellabilityRunRequestPending['answers'],
        currentScore: (req.current_score as SellabilityRunRequestPending['currentScore']) ?? null,
        note: (req.note as string | null | undefined) ?? null,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }
  if (status === 'blocked') {
    return [
      {
        status: 'blocked',
        reason: typeof d.reason === 'string' ? d.reason : undefined,
        missing: Array.isArray(d.missing) ? (d.missing as string[]) : undefined,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }
  return []
}

export function parseListingCreateRequest(data: unknown): ListingCreateRequest[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  const status = d.status
  if (
    (status === 'pending_approval' || status === 'auto_approved') &&
    d.request &&
    typeof d.request === 'object'
  ) {
    const req = d.request as Record<string, unknown>
    const visibility = req.visibility
    return [
      {
        status,
        reportId: typeof req.report_id === 'string' ? req.report_id : undefined,
        accountantCustomerId:
          typeof req.accountant_customer_id === 'string' ? req.accountant_customer_id : null,
        visibility: visibility === 'public' || visibility === 'private' ? visibility : undefined,
        valuationSummary: req.valuation_summary as ListingCreateRequestPending['valuationSummary'],
        note: (req.note as string | null | undefined) ?? null,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }
  if (status === 'blocked') {
    return [
      {
        status: 'blocked',
        reason: typeof d.reason === 'string' ? d.reason : undefined,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }
  return []
}

/**
 * Mirror of Mercury's `registry_search_results` parser branch. KBO (BE),
 * KVK (NL), and Companies House (GB) tool results collapse to one envelope
 * so the consumer can dispatch on shape, not registry -- the `registry`
 * field carries the label. Defensive: drops malformed hits, returns `[]`
 * on bad input.
 */
export function parseRegistrySearchResults(data: unknown): RegistrySearchResults[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  const registryRaw = typeof d.registry_name === 'string' ? d.registry_name : ''
  const registry: 'KBO' | 'KVK' | 'Companies House' =
    registryRaw === 'Companies House' ? 'Companies House' : registryRaw === 'KVK' ? 'KVK' : 'KBO'

  const hitsArr = Array.isArray(d.results) ? d.results : []
  const hits: RegistrySearchHit[] = hitsArr
    .filter((h): h is Record<string, unknown> => typeof h === 'object' && h !== null)
    .map((h) => {
      const kvkNumber = typeof h.kvk_number === 'string' ? h.kvk_number : null
      const companiesHouseNumber =
        typeof h.companies_house_number === 'string' ? h.companies_house_number : null
      const registrationNumber =
        typeof h.registration_number === 'string' ? h.registration_number : null
      const kboNumber = typeof h.kbo_number === 'string' ? h.kbo_number : null
      const num = kvkNumber ?? companiesHouseNumber ?? registrationNumber ?? kboNumber ?? ''
      return {
        companyNumber: num,
        companyName: typeof h.company_name === 'string' ? h.company_name : '',
        legalForm: typeof h.legal_form === 'string' ? h.legal_form : null,
        city: typeof h.city === 'string' ? h.city : null,
        postalCode: typeof h.postal_code === 'string' ? h.postal_code : null,
        address: typeof h.address === 'string' ? h.address : null,
        countryCode:
          typeof h.country_code === 'string'
            ? h.country_code
            : registry === 'KVK'
              ? 'NL'
              : registry === 'Companies House'
                ? 'GB'
                : 'BE',
        naceCode: typeof h.nace_code === 'string' ? h.nace_code : null,
        naceDescription: typeof h.nace_description === 'string' ? h.nace_description : null,
        businessTypeId: typeof h.business_type_id === 'string' ? h.business_type_id : null,
        businessTypeTitle: typeof h.business_type_title === 'string' ? h.business_type_title : null,
        foundationDate: typeof h.foundation_date === 'string' ? h.foundation_date : null,
        isActive: typeof h.is_active === 'boolean' ? h.is_active : null,
      }
    })
    .filter((h) => h.companyNumber.length > 0 && h.companyName.length > 0)

  const totalFound = typeof d.total_found === 'number' ? d.total_found : hits.length
  const coverageWarningRaw = typeof d.coverage_warning === 'string' ? d.coverage_warning : null
  const coverageWarning: 'kvk_not_in_dataset' | 'upstream_degraded' | undefined =
    coverageWarningRaw === 'kvk_not_in_dataset' || coverageWarningRaw === 'upstream_degraded'
      ? coverageWarningRaw
      : undefined
  const status: 'ok' | 'failed' =
    typeof d.status === 'string' && d.status === 'failed' ? 'failed' : 'ok'

  return [
    {
      registry,
      query: hits[0]?.companyName ?? '',
      totalFound,
      hits,
      ...(coverageWarning ? { coverageWarning } : {}),
      ...(typeof d.note === 'string' ? { note: d.note } : {}),
      status,
    },
  ]
}

function parseBusinessTypeSearchResult(value: unknown): BusinessTypeSearchResult | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const id = typeof item.id === 'string' ? item.id : ''
  const title = typeof item.title === 'string' ? item.title : ''
  if (!id || !title) return null
  const benchmarks =
    item.valuation_benchmarks && typeof item.valuation_benchmarks === 'object'
      ? (item.valuation_benchmarks as Record<string, unknown>)
      : null
  return {
    id,
    title,
    description: typeof item.description === 'string' ? item.description : null,
    category: typeof item.category === 'string' ? item.category : null,
    industry: typeof item.industry === 'string' ? item.industry : null,
    sector: typeof item.sector === 'string' ? item.sector : null,
    primaryModel: typeof item.primary_model === 'string' ? item.primary_model : null,
    preferredMultiples: parseStringArray(item.preferred_multiples),
    benchmarkStatus: typeof benchmarks?.status === 'string' ? benchmarks.status : null,
    benchmarkMessage: typeof benchmarks?.message === 'string' ? benchmarks.message : null,
  }
}

export function parseBusinessTypeSearchResults(data: unknown): BusinessTypeSearchResults[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  const rawResults = Array.isArray(d.results) ? d.results : d.business_type ? [d.business_type] : []
  const results = rawResults
    .map(parseBusinessTypeSearchResult)
    .filter((result): result is BusinessTypeSearchResult => Boolean(result))
  const status: 'ok' | 'empty' | 'failed' =
    d.status === 'failed' || typeof d.error === 'string'
      ? 'failed'
      : results.length > 0
        ? 'ok'
        : 'empty'

  return [
    {
      status,
      query: typeof d.query === 'string' ? d.query : (results[0]?.title ?? ''),
      totalFound: typeof d.total_found === 'number' ? d.total_found : results.length,
      results,
      ...(typeof d.note === 'string' ? { note: d.note } : {}),
      ...(typeof d.error === 'string' ? { error: d.error } : {}),
    },
  ]
}
