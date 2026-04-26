'use client'

/**
 * SourceDataPanel
 *
 * "Trust but Verify" panel that shows raw ledger accounts from Hermes
 * mapped to each financial field. Displayed as a collapsible side panel
 * triggered by the SpotlightBanner's eye icon or field-level clicks.
 *
 * Groups provenance data by financial field and shows:
 * - MAR account code -> financial field mapping
 * - Direct vs fallback vs computed mapping method
 * - Option to re-assign unmapped/fallback accounts
 */

import { cn } from '@/design-system/utils'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Database,
  ScrollText,
  X,
} from 'lucide-react'
import { useLocale } from 'next-intl'
import { useEffect, useState, type ReactNode } from 'react'
import { accountingProviderDisplayName } from '../../services/api/accounting'
import {
  parseSpotlightDomId,
  useSpotlightStore,
  type SpotlightFieldProvenance,
} from '../../store/useSpotlightStore'

const FIELD_LABELS: Record<string, { en: string; nl: string }> = {
  revenue: { en: 'Revenue', nl: 'Omzet' },
  cost_of_goods_sold: { en: 'Cost of Goods Sold', nl: 'Kostprijs verkopen' },
  operating_expenses: { en: 'Operating Expenses', nl: 'Bedrijfskosten' },
  ebitda: { en: 'EBITDA', nl: 'EBITDA' },
  depreciation: { en: 'Depreciation', nl: 'Afschrijvingen' },
  interest_expense: { en: 'Interest Expense', nl: 'Rentelasten' },
  taxes: { en: 'Taxes', nl: 'Belastingen' },
  net_income: { en: 'Net Income', nl: 'Netto resultaat' },
  owner_director_compensation: { en: 'Director Compensation', nl: 'Bezoldiging bestuurder' },
  rent_expense: { en: 'Rent', nl: 'Huur' },
  personnel_costs: { en: 'Personnel Costs', nl: 'Personeelskosten' },
  total_assets: { en: 'Total Assets', nl: 'Totale activa' },
  current_assets: { en: 'Current Assets', nl: 'Vlottende activa' },
  fixed_assets: { en: 'Fixed Assets', nl: 'Vaste activa' },
  cash_and_equivalents: { en: 'Cash', nl: 'Liquide middelen' },
  accounts_receivable: { en: 'Accounts Receivable', nl: 'Handelsvorderingen' },
  inventory: { en: 'Inventory', nl: 'Voorraden' },
  total_liabilities: { en: 'Total Liabilities', nl: 'Totale schulden' },
  current_liabilities: { en: 'Current Liabilities', nl: 'Kortlopende schulden' },
  long_term_debt: { en: 'Long-term Debt', nl: 'Langlopende schulden' },
  equity: { en: 'Equity', nl: 'Eigen vermogen' },
}

const METHOD_BADGES: Record<string, { label: string; className: string }> = {
  direct: {
    label: 'Direct',
    className: 'bg-emerald-500/10 text-emerald-600',
  },
  computed: {
    label: 'Computed',
    className: 'bg-blue-500/10 text-blue-600',
  },
  fallback: {
    label: 'Fallback',
    className: 'bg-amber-500/10 text-amber-600',
  },
  manual: {
    label: 'Manual',
    className: 'bg-foreground/5 text-muted-foreground',
  },
}

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '-'
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function SourceDataPanel() {
  const locale = useLocale()
  const { showSourcePanel, toggleSourcePanel, importQuality, activeDomId, provider } =
    useSpotlightStore()
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!showSourcePanel || !activeDomId || !importQuality) return
    const { field, yearKey } = parseSpotlightDomId(activeDomId)
    const resolvedYearKey =
      yearKey ??
      Object.keys(importQuality)
        .sort((a, b) => Number(b) - Number(a))
        .find((candidateYear) =>
          (importQuality[candidateYear]?.field_provenance ?? []).some(
            (prov) => prov.field === field
          )
        )

    if (!resolvedYearKey) return

    setExpandedFields((prev) => {
      const next = new Set(prev)
      next.add(`${resolvedYearKey}::${field}`)
      return next
    })
  }, [activeDomId, importQuality, showSourcePanel])

  if (!showSourcePanel || !importQuality) return null

  const allProvenance: Array<{ yearKey: string; prov: SpotlightFieldProvenance }> =
    Object.entries(importQuality)
      .sort(([a], [b]) => Number(b) - Number(a))
      .flatMap(([yearKey, yearQuality]) =>
        (yearQuality.field_provenance ?? []).map(prov => ({ yearKey, prov })),
      )

  // Group by category
  const incomeFields = ['revenue', 'cost_of_goods_sold', 'operating_expenses', 'ebitda', 'depreciation', 'interest_expense', 'taxes', 'net_income']
  const normFields = ['owner_director_compensation', 'rent_expense', 'personnel_costs']
  const balanceFields = ['total_assets', 'current_assets', 'fixed_assets', 'cash_and_equivalents', 'accounts_receivable', 'inventory', 'total_liabilities', 'current_liabilities', 'long_term_debt', 'equity']

  const categories = [
    { key: 'income', label: locale === 'nl' ? 'Resultatenrekening' : 'Income Statement', fields: incomeFields },
    { key: 'normalization', label: locale === 'nl' ? 'Normalisatie-items' : 'Normalization Items', fields: normFields },
    { key: 'balance', label: locale === 'nl' ? 'Balans' : 'Balance Sheet', fields: balanceFields },
  ]

  const toggleField = (key: string) => {
    setExpandedFields(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.2 }}
        className='fixed right-0 top-0 bottom-0 w-[360px] bg-background border-l border-border shadow-lg z-50 flex flex-col'
      >
        {/* Header */}
        <div className='flex items-center gap-3 px-4 py-3 border-b border-border shrink-0'>
          <Database className='w-4 h-4 text-primary' />
          <h3 className='text-sm font-semibold text-foreground flex-1'>
            {locale === 'nl' ? 'Brongegevens' : 'Source Data'}
          </h3>
          <button
            type='button'
            onClick={toggleSourcePanel}
            className='p-1.5 rounded hover:bg-foreground/5 transition-colors'
          >
            <X className='w-4 h-4 text-muted-foreground' />
          </button>
        </div>

        {/* Quality summary */}
        <div className='px-4 py-3 bg-foreground/[0.02] border-b border-border text-xs text-muted-foreground'>
          {(() => {
            const years = Object.keys(importQuality).sort((a, b) => Number(a) - Number(b))
            const totalAccounts = Object.values(importQuality).reduce((s, q) => s + q.total_accounts_processed, 0)
            const directAccounts = Object.values(importQuality).reduce((s, q) => s + q.accounts_mapped_directly, 0)
            const fallbackAccounts = Object.values(importQuality).reduce((s, q) => s + q.accounts_fallback, 0)

            const providerLabel = provider ? accountingProviderDisplayName(provider) : null

            // Most recent fetch across years; tolerates undefined/invalid timestamps.
            const latestFetchedAt = (() => {
              let latest: Date | null = null
              for (const q of Object.values(importQuality)) {
                if (!q.fetched_at) continue
                const d = new Date(q.fetched_at)
                if (Number.isNaN(d.getTime())) continue
                if (!latest || d > latest) latest = d
              }
              if (!latest) return null
              return latest.toLocaleDateString(locale === 'nl' ? 'nl-BE' : 'en-BE', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            })()

            const summaryParts: ReactNode[] = [
              `${totalAccounts} ${locale === 'nl' ? 'rekeningen verwerkt' : 'accounts processed'}`,
            ]
            if (providerLabel) {
              summaryParts.push(`via ${providerLabel}`)
            }
            if (latestFetchedAt) {
              summaryParts.push(latestFetchedAt)
            }
            summaryParts.push(
              <span key='direct' className='text-emerald-600'>{directAccounts} direct</span>,
            )
            if (fallbackAccounts > 0) {
              summaryParts.push(
                <span key='fallback' className='text-amber-600'>{fallbackAccounts} fallback</span>,
              )
            }

            // Years that the integration returned but for which no field got mapped.
            // Flags a real coverage gap an accountant should know about.
            const yearsWithoutProvenance = years.filter(
              (y) => (importQuality[y]?.field_provenance ?? []).length === 0
            )

            return (
              <div className='space-y-1'>
                <p>{locale === 'nl' ? 'Boekjaren' : 'Fiscal years'}: {years.join(', ')}</p>
                <p className='flex flex-wrap items-center gap-x-1.5 gap-y-0.5'>
                  {summaryParts.map((part, i) => (
                    <span key={i} className='inline-flex items-center'>
                      {i > 0 && <span className='text-foreground/30 mr-1.5'>·</span>}
                      {part}
                    </span>
                  ))}
                </p>
                {yearsWithoutProvenance.length > 0 && (
                  <p className='text-amber-600'>
                    {locale === 'nl'
                      ? `Geen veldmappings voor: ${yearsWithoutProvenance.map((y) => `BJ ${y}`).join(', ')}`
                      : `No field mappings for: ${yearsWithoutProvenance.map((y) => `FY ${y}`).join(', ')}`}
                  </p>
                )}
              </div>
            )
          })()}
        </div>

        {/* AI mapping notes (labels only — amounts stay in provenance / form) */}
        {Object.entries(importQuality).some(([, q]) => q.ai_enrichment) && (
          <div className='px-4 py-3 border-b border-border bg-violet-500/[0.06]'>
            <div className='flex items-center gap-2 text-xs font-semibold text-foreground mb-1'>
              <ScrollText className='w-3.5 h-3.5 text-violet-600' />
              {locale === 'nl' ? 'AI — uitleg' : 'AI — rationale'}
            </div>
            <p className='text-[10px] text-muted-foreground mb-2 leading-snug'>
              {locale === 'nl'
                ? 'Privacy: gevoelige patronen worden uit labels gehaald; geen eurobedragen naar AI. Jij blijft eindverantwoordelijk.'
                : 'Privacy: sensitive patterns are stripped from labels; no euro amounts to AI. You remain accountable for the valuation.'}
            </p>
            <div className='space-y-3 max-h-40 overflow-y-auto'>
              {Object.entries(importQuality)
                .sort(([a], [b]) => Number(b) - Number(a))
                .map(([yearKey, q]) => {
                  const ai = q.ai_enrichment
                  if (!ai) return null
                  const tierLabel =
                    ai.review_tier === 'high_confidence'
                      ? locale === 'nl'
                        ? 'Hoog vertrouwen'
                        : 'High confidence'
                      : ai.review_tier === 'needs_verification'
                        ? locale === 'nl'
                          ? 'Te verifiëren'
                          : 'Needs verification'
                        : locale === 'nl'
                          ? 'Handmatig'
                          : 'Manual review'
                  return (
                    <div key={yearKey} className='text-[11px] text-muted-foreground space-y-1.5'>
                      <p className='font-medium text-foreground/80'>
                        {locale === 'nl' ? 'Boekjaar' : 'FY'} {yearKey}{' '}
                        <span className='text-violet-600/90 font-normal'>({tierLabel})</span>
                      </p>
                      {ai.ledger_mappings.slice(0, 5).map(row => (
                        <p key={`${yearKey}-${row.ledger_code}`} className='leading-snug pl-2 border-l-2 border-violet-500/30'>
                          <span className='font-mono text-foreground/60'>{row.ledger_code}</span>
                          {' → '}
                          <span className='text-foreground/90'>{row.upswitch_field}</span>
                          {' · '}
                          {Math.round(row.confidence)}%
                          <br />
                          <span className='text-foreground/70'>
                            {locale === 'nl' ? row.rationale_nl : row.rationale_en}
                          </span>
                        </p>
                      ))}
                      {ai.normalization_hints.slice(0, 2).map(h => (
                        <p key={`${yearKey}-${h.hint_code}`} className='leading-snug pl-2 border-l-2 border-amber-500/30'>
                          <span className='font-medium text-foreground/85'>
                            {locale === 'nl' ? h.title_nl : h.title_en}
                          </span>
                          <br />
                          <span className='text-foreground/70'>
                            {locale === 'nl' ? h.rationale_nl : h.rationale_en}
                          </span>
                        </p>
                      ))}
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Provenance list */}
        <div className='flex-1 overflow-y-auto'>
          {categories.map(cat => {
            const catProvenance = allProvenance.filter(p => cat.fields.includes(p.prov.field))
            if (catProvenance.length === 0) return null

            return (
              <div key={cat.key} className='border-b border-border/50'>
                <div className='px-4 py-2 bg-foreground/[0.02]'>
                  <span className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>
                    {cat.label}
                  </span>
                </div>

                {catProvenance.map(({ yearKey, prov }) => {
                  const label = FIELD_LABELS[prov.field]
                  const displayLabel = label
                    ? (locale === 'nl' ? label.nl : label.en)
                    : prov.field
                  const methodBadge = METHOD_BADGES[prov.mapping_method] || METHOD_BADGES.manual
                  const rowKey = `${yearKey}::${prov.field}`
                  const isExpanded = expandedFields.has(rowKey)

                  return (
                    <div key={rowKey}>
                      <button
                        type='button'
                        onClick={() => toggleField(rowKey)}
                        className='w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-foreground/[0.03] transition-colors'
                      >
                        {isExpanded ? (
                          <ChevronDown className='w-3 h-3 text-muted-foreground shrink-0' />
                        ) : (
                          <ChevronRight className='w-3 h-3 text-muted-foreground shrink-0' />
                        )}

                        <span className='text-xs font-medium text-foreground flex-1 truncate'>
                          {displayLabel}
                        </span>

                        <span className='text-[10px] text-muted-foreground rounded-full bg-foreground/[0.04] px-1.5 py-0.5'>
                          {locale === 'nl' ? 'BJ' : 'FY'} {yearKey}
                        </span>

                        <span className='text-xs font-mono tabular-nums text-foreground/70'>
                          {formatCurrency(prov.value)}
                        </span>

                        <span
                          className={cn(
                            'text-[9px] font-medium px-1.5 py-0.5 rounded-full',
                            methodBadge.className,
                          )}
                        >
                          {methodBadge.label}
                        </span>
                      </button>

                      {/* Expanded: show source accounts */}
                      <AnimatePresence>
                        {isExpanded && prov.source_accounts.length > 0 && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className='overflow-hidden'
                          >
                            <div className='px-4 pb-2 space-y-1'>
                              {prov.source_accounts.map((code, i) => (
                                <div
                                  key={`${code}-${i}`}
                                  className='flex items-center gap-2 text-[11px] text-muted-foreground pl-5'
                                >
                                  <span className='font-mono text-foreground/50'>MAR {code}</span>
                                  <ArrowRight className='w-2.5 h-2.5 text-foreground/20' />
                                  <span className='truncate'>
                                    {displayLabel} · {locale === 'nl' ? 'BJ' : 'FY'} {yearKey}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Unmapped ledger lines per year — Hermes saw these but couldn't map them.
              Surfaced so the accountant has a working list of accounts to review. */}
          {(() => {
            const yearsWithUnmapped = Object.entries(importQuality)
              .filter(([, q]) => (q.unmapped_ledger_lines ?? []).length > 0)
              .sort(([a], [b]) => Number(b) - Number(a))
            if (yearsWithUnmapped.length === 0) return null

            return (
              <div className='border-b border-border/50'>
                <div className='px-4 py-2 bg-foreground/[0.02]'>
                  <span className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>
                    {locale === 'nl' ? 'Niet-gemapte rekeningen' : 'Unmapped accounts'}
                  </span>
                </div>
                {yearsWithUnmapped.map(([yearKey, q]) => {
                  const lines = q.unmapped_ledger_lines ?? []
                  const sectionKey = `unmapped::${yearKey}`
                  const isOpen = expandedFields.has(sectionKey)
                  return (
                    <div key={sectionKey}>
                      <button
                        type='button'
                        onClick={() => toggleField(sectionKey)}
                        className='w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-foreground/[0.03] transition-colors'
                      >
                        {isOpen ? (
                          <ChevronDown className='w-3 h-3 text-muted-foreground shrink-0' />
                        ) : (
                          <ChevronRight className='w-3 h-3 text-muted-foreground shrink-0' />
                        )}
                        <span className='text-xs font-medium text-foreground flex-1 truncate'>
                          {locale === 'nl' ? 'Niet gemapt' : 'Unmapped'}
                        </span>
                        <span className='text-[10px] text-muted-foreground rounded-full bg-foreground/[0.04] px-1.5 py-0.5'>
                          {locale === 'nl' ? 'BJ' : 'FY'} {yearKey}
                        </span>
                        <span className='text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600'>
                          {lines.length}
                        </span>
                      </button>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className='overflow-hidden'
                          >
                            <div className='px-4 pb-2 space-y-1'>
                              {lines.slice(0, 50).map((line, i) => (
                                <div
                                  key={`${line.account_code}-${i}`}
                                  className='flex items-center gap-2 text-[11px] text-muted-foreground pl-5'
                                >
                                  <span className='font-mono text-foreground/50'>
                                    {line.account_code}
                                  </span>
                                  <span className='truncate text-foreground/60'>
                                    {line.description}
                                  </span>
                                </div>
                              ))}
                              {lines.length > 50 && (
                                <p className='text-[11px] text-muted-foreground pl-5 italic'>
                                  +{lines.length - 50} {locale === 'nl' ? 'meer' : 'more'}
                                </p>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
