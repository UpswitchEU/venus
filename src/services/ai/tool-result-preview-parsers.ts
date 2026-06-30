import type {
  AdvisorCopilotAgendaItem,
  AdvisorCopilotCitation,
  AdvisorCopilotDraft,
  AdvisorCopilotServiceAngle,
  AdvisorCopilotTalkingPoint,
  AdvisorCopilotYearPlanItem,
  BelgianCompanyBootstrap,
  BuyerProfilePreview,
  ClientDataReadinessPreview,
  ListingPreview,
  MethodReadinessPreview,
} from './tool-result-types'

function optionalTrimmedString(value: unknown, max = 300): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.slice(0, max) : undefined
}

function nullableFiniteNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function recordArray(value: unknown, maxItems: number): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .slice(0, maxItems)
}

function sourceKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => optionalTrimmedString(item, 120))
    .filter((item): item is string => Boolean(item))
    .slice(0, 8)
}

function parseAdvisorCopilotCitations(value: unknown): AdvisorCopilotCitation[] {
  return recordArray(value, 12)
    .map((item): AdvisorCopilotCitation | null => {
      const key = optionalTrimmedString(item.key, 80)
      const label = optionalTrimmedString(item.label, 160)
      const source = optionalTrimmedString(item.source, 160)
      if (!key || !label || !source) return null
      const detail = optionalTrimmedString(item.detail, 240)
      return detail ? { key, label, source, detail } : { key, label, source }
    })
    .filter((item): item is AdvisorCopilotCitation => item !== null)
}

function parseAdvisorCopilotYearPlan(value: unknown): AdvisorCopilotYearPlanItem[] {
  return recordArray(value, 8)
    .map((item): AdvisorCopilotYearPlanItem | null => {
      const title = optionalTrimmedString(item.title, 180)
      if (!title) return null
      return {
        title,
        objective: optionalTrimmedString(item.objective, 260) ?? null,
        targetDelta: nullableFiniteNumber(item.target_delta),
        rationale: optionalTrimmedString(item.rationale, 360) ?? null,
        sourceKeys: sourceKeys(item.source_keys),
      }
    })
    .filter((item): item is AdvisorCopilotYearPlanItem => item !== null)
}

function parseAdvisorCopilotAgenda(value: unknown): AdvisorCopilotAgendaItem[] {
  return recordArray(value, 10)
    .map((item): AdvisorCopilotAgendaItem | null => {
      const title = optionalTrimmedString(item.title, 180)
      if (!title) return null
      return {
        title,
        durationMinutes: nullableFiniteNumber(item.duration_minutes),
        advisorPrep: optionalTrimmedString(item.advisor_prep, 260) ?? null,
        ownerPrompt: optionalTrimmedString(item.owner_prompt, 260) ?? null,
        sourceKeys: sourceKeys(item.source_keys),
      }
    })
    .filter((item): item is AdvisorCopilotAgendaItem => item !== null)
}

function parseAdvisorCopilotTalkingPoints(value: unknown): AdvisorCopilotTalkingPoint[] {
  return recordArray(value, 10)
    .map((item): AdvisorCopilotTalkingPoint | null => {
      const point = optionalTrimmedString(item.point, 260)
      if (!point) return null
      return {
        point,
        rationale: optionalTrimmedString(item.rationale, 360) ?? null,
        euroDelta: nullableFiniteNumber(item.euro_delta),
        sourceKeys: sourceKeys(item.source_keys),
      }
    })
    .filter((item): item is AdvisorCopilotTalkingPoint => item !== null)
}

function parseAdvisorCopilotServiceAngles(value: unknown): AdvisorCopilotServiceAngle[] {
  return recordArray(value, 8)
    .map((item): AdvisorCopilotServiceAngle | null => {
      const title = optionalTrimmedString(item.title, 180)
      if (!title) return null
      return {
        title,
        scope: optionalTrimmedString(item.scope, 300) ?? null,
        rationale: optionalTrimmedString(item.rationale, 360) ?? null,
        sourceKeys: sourceKeys(item.source_keys),
      }
    })
    .filter((item): item is AdvisorCopilotServiceAngle => item !== null)
}

export function parseAdvisorCopilotDraft(data: unknown): AdvisorCopilotDraft[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>

  if (d.status === 'blocked') {
    return [
      {
        status: 'blocked',
        yearPlan: [],
        firstCheckInAgenda: [],
        talkingPoints: [],
        billableServiceAngles: [],
        citations: [],
        reason: optionalTrimmedString(d.reason, 160),
        message: optionalTrimmedString(d.message, 300),
      },
    ]
  }

  if (d.status !== 'pending_review') return []

  const citations = parseAdvisorCopilotCitations(d.citations)
  const yearPlan = parseAdvisorCopilotYearPlan(d.year_plan)
  const firstCheckInAgenda = parseAdvisorCopilotAgenda(d.first_check_in_agenda)
  const talkingPoints = parseAdvisorCopilotTalkingPoints(d.talking_points)
  const billableServiceAngles = parseAdvisorCopilotServiceAngles(d.billable_service_angles)
  const hasContent =
    yearPlan.length > 0 ||
    firstCheckInAgenda.length > 0 ||
    talkingPoints.length > 0 ||
    billableServiceAngles.length > 0

  if (!hasContent || citations.length === 0) return []

  return [
    {
      status: 'pending_review',
      trajectoryId: optionalTrimmedString(d.trajectory_id, 80) ?? null,
      reportId: optionalTrimmedString(d.report_id, 80) ?? null,
      businessName: optionalTrimmedString(d.business_name, 180) ?? null,
      yearPlan,
      firstCheckInAgenda,
      talkingPoints,
      billableServiceAngles,
      citations,
      message: optionalTrimmedString(d.message, 300),
    },
  ]
}

export function parseClientDataReadiness(data: unknown): ClientDataReadinessPreview[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  if (typeof d.status !== 'string') return []

  const sources = Array.isArray(d.accounting_sources)
    ? d.accounting_sources
        .filter(
          (source): source is Record<string, unknown> =>
            typeof source === 'object' && source !== null
        )
        .map((source) => ({
          provider: typeof source.provider === 'string' ? source.provider : '',
          clientKey: typeof source.client_key === 'string' ? source.client_key : null,
          isPrimaryForValuation:
            typeof source.is_primary_for_valuation === 'boolean'
              ? source.is_primary_for_valuation
              : undefined,
          lastSyncAt: typeof source.last_sync_at === 'string' ? source.last_sync_at : null,
        }))
        .filter((source) => source.provider.length > 0)
    : []
  const summary =
    d.import_quality_summary && typeof d.import_quality_summary === 'object'
      ? (d.import_quality_summary as Record<string, unknown>)
      : null
  const topFlags = Array.isArray(summary?.top_flags)
    ? summary.top_flags
        .filter(
          (flag): flag is Record<string, unknown> => typeof flag === 'object' && flag !== null
        )
        .map((flag) => ({
          year: typeof flag.year === 'string' ? flag.year : undefined,
          field: typeof flag.field === 'string' ? flag.field : null,
          code: typeof flag.code === 'string' ? flag.code : null,
          severity: typeof flag.severity === 'string' ? flag.severity : null,
          message: typeof flag.message === 'string' ? flag.message : null,
        }))
    : []

  return [
    {
      status: d.status,
      clientId: typeof d.client_id === 'string' ? d.client_id : undefined,
      businessName: typeof d.business_name === 'string' ? d.business_name : null,
      hasBusinessCard: typeof d.has_business_card === 'boolean' ? d.has_business_card : undefined,
      hasSyncedFinancials:
        typeof d.has_synced_financials === 'boolean' ? d.has_synced_financials : undefined,
      hasFinancialData:
        typeof d.has_financial_data === 'boolean' ? d.has_financial_data : undefined,
      financialSyncedAt: typeof d.financial_synced_at === 'string' ? d.financial_synced_at : null,
      stpStatus: typeof d.stp_status === 'string' ? d.stp_status : null,
      computedStpStatus: typeof d.computed_stp_status === 'string' ? d.computed_stp_status : null,
      latestValuationId: typeof d.latest_valuation_id === 'string' ? d.latest_valuation_id : null,
      accountingSources: sources,
      importQualitySummary: summary
        ? {
            years: Array.isArray(summary.years)
              ? summary.years.filter((year): year is string => typeof year === 'string')
              : [],
            minConfidence:
              typeof summary.min_confidence === 'number' ? summary.min_confidence : null,
            errorCount: typeof summary.error_count === 'number' ? summary.error_count : undefined,
            warningCount:
              typeof summary.warning_count === 'number' ? summary.warning_count : undefined,
            infoCount: typeof summary.info_count === 'number' ? summary.info_count : undefined,
            actionableFlagCount:
              typeof summary.actionable_flag_count === 'number'
                ? summary.actionable_flag_count
                : undefined,
            topFlags,
          }
        : null,
      recommendedNextAction:
        typeof d.recommended_next_action === 'string' ? d.recommended_next_action : undefined,
      recommendedNextTool:
        typeof d.recommended_next_tool === 'string' ? d.recommended_next_tool : null,
      recommendedNextRoute:
        typeof d.recommended_next_route === 'string' ? d.recommended_next_route : null,
      message: typeof d.message === 'string' ? d.message : undefined,
    },
  ]
}

export function parseMethodReadiness(data: unknown): MethodReadinessPreview[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  if (typeof d.status !== 'string') return []
  const readyMethods = Array.isArray(d.ready_methods)
    ? d.ready_methods.filter((method): method is string => typeof method === 'string')
    : []
  const blockedMethods = Array.isArray(d.blocked_methods)
    ? d.blocked_methods.filter((method): method is string => typeof method === 'string')
    : []

  return [
    {
      status: d.status === 'ok' ? 'ok' : 'blocked',
      reportId: typeof d.report_id === 'string' ? d.report_id : undefined,
      businessName: typeof d.business_name === 'string' ? d.business_name : null,
      readinessSource: typeof d.readiness_source === 'string' ? d.readiness_source : null,
      readyMethods,
      blockedMethods,
      reason: typeof d.reason === 'string' ? d.reason : d.status === 'ok' ? undefined : d.status,
      message: typeof d.message === 'string' ? d.message : undefined,
    },
  ]
}

export function parseBelgianCompanyBootstrap(data: unknown): BelgianCompanyBootstrap[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>
  if (
    d.status !== 'ok' &&
    d.status !== 'partial' &&
    d.status !== 'blocked' &&
    d.status !== 'failed'
  ) {
    return []
  }

  const identity =
    d.identity && typeof d.identity === 'object' ? (d.identity as Record<string, unknown>) : null
  const benchmark =
    d.benchmark && typeof d.benchmark === 'object' ? (d.benchmark as Record<string, unknown>) : null
  const filing =
    d.filing_summary && typeof d.filing_summary === 'object'
      ? (d.filing_summary as Record<string, unknown>)
      : null
  const preview =
    d.valuation_preview && typeof d.valuation_preview === 'object'
      ? (d.valuation_preview as Record<string, unknown>)
      : null

  return [
    {
      status: d.status,
      reason: typeof d.reason === 'string' ? d.reason : undefined,
      message: typeof d.message === 'string' ? d.message : undefined,
      identity: identity
        ? {
            legalName: typeof identity.legal_name === 'string' ? identity.legal_name : null,
            legalForm: typeof identity.legal_form === 'string' ? identity.legal_form : null,
            kboNumber: typeof identity.kbo_number === 'string' ? identity.kbo_number : null,
            address: typeof identity.address === 'string' ? identity.address : null,
            city: typeof identity.city === 'string' ? identity.city : null,
            postalCode: typeof identity.postal_code === 'string' ? identity.postal_code : null,
            naceCode: typeof identity.nace_code === 'string' ? identity.nace_code : null,
            naceDescription:
              typeof identity.nace_description === 'string' ? identity.nace_description : null,
            foundationDate:
              typeof identity.foundation_date === 'string' ? identity.foundation_date : null,
            isActive: typeof identity.is_active === 'boolean' ? identity.is_active : null,
          }
        : null,
      benchmark: benchmark
        ? {
            status: typeof benchmark.status === 'string' ? benchmark.status : null,
            businessTypeTitle:
              typeof benchmark.business_type_title === 'string'
                ? benchmark.business_type_title
                : null,
            evEbitdaMedian:
              typeof benchmark.ev_ebitda_median === 'number' ? benchmark.ev_ebitda_median : null,
            confidence: typeof benchmark.confidence === 'string' ? benchmark.confidence : null,
          }
        : null,
      filingSummary: filing
        ? {
            status: typeof filing.status === 'string' ? filing.status : null,
            source: typeof filing.source === 'string' ? filing.source : null,
            filingYear: typeof filing.filing_year === 'number' ? filing.filing_year : null,
            yearsAvailable:
              typeof filing.years_available === 'number' ? filing.years_available : null,
            revenue: typeof filing.revenue === 'number' ? filing.revenue : null,
            ebitda: typeof filing.ebitda === 'number' ? filing.ebitda : null,
            dataHealthMessage:
              typeof filing.data_health_message === 'string' ? filing.data_health_message : null,
          }
        : null,
      valuationPreview: preview
        ? {
            status: typeof preview.status === 'string' ? preview.status : null,
            method: typeof preview.method === 'string' ? preview.method : null,
            ebitdaUsed: typeof preview.ebitda_used === 'number' ? preview.ebitda_used : null,
            ebitdaYear: typeof preview.ebitda_year === 'number' ? preview.ebitda_year : null,
            evMid: typeof preview.ev_mid === 'number' ? preview.ev_mid : null,
            equityMid: typeof preview.equity_mid === 'number' ? preview.equity_mid : null,
          }
        : null,
    },
  ]
}

export function parseListingPreview(data: unknown): ListingPreview[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>

  if (d.status === 'ok') {
    const preview =
      d.preview && typeof d.preview === 'object' ? (d.preview as Record<string, unknown>) : null
    const missingFields = Array.isArray(d.missing_fields)
      ? d.missing_fields.filter((field): field is string => typeof field === 'string')
      : []

    return [
      {
        status: 'ok',
        reportId: typeof d.report_id === 'string' ? d.report_id : undefined,
        sourceBusinessName:
          typeof d.source_business_name === 'string' ? d.source_business_name : null,
        missingFields,
        nextActionHint: typeof d.next_action_hint === 'string' ? d.next_action_hint : null,
        preview: preview
          ? {
              title: typeof preview.anonymized_title === 'string' ? preview.anonymized_title : null,
              businessType:
                typeof preview.business_type === 'string' ? preview.business_type : null,
              sector: typeof preview.sector === 'string' ? preview.sector : null,
              industry: typeof preview.industry === 'string' ? preview.industry : null,
              region: typeof preview.region === 'string' ? preview.region : null,
              province: typeof preview.province === 'string' ? preview.province : null,
              yearCommenced:
                typeof preview.year_commenced === 'number' ? preview.year_commenced : null,
              employeeRange:
                typeof preview.employee_range === 'string' ? preview.employee_range : null,
              revenueRange:
                typeof preview.revenue_range === 'string' ? preview.revenue_range : null,
              equityStake: typeof preview.equity_stake === 'string' ? preview.equity_stake : null,
              ownershipStructure:
                typeof preview.ownership_structure === 'string'
                  ? preview.ownership_structure
                  : null,
              ownerManagersCount:
                typeof preview.owner_managers_count === 'number'
                  ? preview.owner_managers_count
                  : null,
              status: typeof preview.status === 'string' ? preview.status : null,
              featured: typeof preview.featured === 'boolean' ? preview.featured : null,
              ndaRequired: typeof preview.nda_required === 'boolean' ? preview.nda_required : null,
              viewCount: typeof preview.view_count === 'number' ? preview.view_count : null,
              hasVerifiedValuation:
                typeof preview.has_verified_valuation === 'boolean'
                  ? preview.has_verified_valuation
                  : null,
            }
          : null,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }

  if (typeof d.status !== 'string') return []
  return [
    {
      status: 'blocked',
      reportId: typeof d.report_id === 'string' ? d.report_id : undefined,
      reason: typeof d.reason === 'string' ? d.reason : d.status,
      message: typeof d.message === 'string' ? d.message : undefined,
    },
  ]
}

export function parseBuyerProfilePreview(data: unknown): BuyerProfilePreview[] {
  if (!data || typeof data !== 'object') return []
  const d = data as Record<string, unknown>

  if (d.status === 'blocked') {
    return [
      {
        status: 'blocked',
        reportId: typeof d.report_id === 'string' ? d.report_id : undefined,
        reason: typeof d.reason === 'string' ? d.reason : undefined,
        message: typeof d.message === 'string' ? d.message : undefined,
      },
    ]
  }

  if (d.status !== 'ok') return []

  const readiness =
    d.listing_readiness && typeof d.listing_readiness === 'object'
      ? (d.listing_readiness as Record<string, unknown>)
      : null
  const missingFields = Array.isArray(readiness?.missing_fields)
    ? readiness.missing_fields.filter((field): field is string => typeof field === 'string')
    : []
  const buyerSegments = Array.isArray(d.buyer_segments)
    ? d.buyer_segments
        .filter(
          (segment): segment is Record<string, unknown> =>
            typeof segment === 'object' && segment !== null
        )
        .map((segment) => ({
          id: typeof segment.id === 'string' ? segment.id : undefined,
          label: typeof segment.label === 'string' ? segment.label : '',
          fitScore: typeof segment.fit_score === 'number' ? segment.fit_score : null,
          recommendedAngle:
            typeof segment.recommended_angle === 'string' ? segment.recommended_angle : null,
        }))
        .filter((segment) => segment.label.length > 0)
    : []

  return [
    {
      status: 'ok',
      reportId: typeof d.report_id === 'string' ? d.report_id : undefined,
      sourceBusinessName:
        typeof d.source_business_name === 'string' ? d.source_business_name : null,
      listingReadiness: {
        status: typeof readiness?.status === 'string' ? readiness.status : null,
        missingFields,
      },
      buyerSegments,
      message: typeof d.message === 'string' ? d.message : undefined,
    },
  ]
}
