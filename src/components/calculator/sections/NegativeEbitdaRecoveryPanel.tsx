'use client'

import { AlertTriangle, CheckCircle2, ChevronRight, Plus, ShieldCheck } from 'lucide-react'
import { useLocale } from 'next-intl'
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from 'react'
import {
  trackNegativeEbitdaDetected,
  trackNormalizationBridgeCompleted,
  trackRecoveryDcfBlocked,
  trackRecoveryDcfCompleted,
  trackRecoveryDcfStarted,
  trackRecoveryResolutionViewed,
  trackRecoveryScenarioUpdated,
} from '@/lib/analytics'
import { useManualResultsStore } from '@/store/manual/useManualResultsStore'
import type {
  ManualValuationFormData,
  RecoveryInputsDraft,
  RecoveryOperatingDriver,
  RecoveryScenarioKey,
} from '@/types/valuation'
import {
  compileRecoveryInputsDraft,
  createRecoveryInputsDraft,
  recoveryDriverRevenue,
  reviewRecoveryInputsDraft,
} from '@/utils/negativeEbitdaRecovery'
import {
  Metric,
  NumberField,
  parseRecoveryEvidence,
  RecoveryFundingAndAssumptions,
  RecoveryResolutionPanel,
  recoveryInputClass,
  TextField,
} from './NegativeEbitdaRecoverySupport'
import { NEGATIVE_EBITDA_RECOVERY_COPY } from './negativeEbitdaRecoveryCopy'

type RecoveryStep = 'scenarios' | 'funding' | 'assumptions' | 'verification'

function ebitdaBand(value: number) {
  if (value < -250_000) return 'below_-250k' as const
  if (value < -100_000) return '-250k_to_-100k' as const
  return '-100k_to_0' as const
}

function createOperatingDriver(
  modelType: RecoveryOperatingDriver['model_type'],
  revenue: number
): RecoveryOperatingDriver {
  switch (modelType) {
    case 'customer_acv':
      return { model_type: modelType, customers: 1, annual_contract_value: revenue }
    case 'consultant_capacity':
      return {
        model_type: modelType,
        consultants: 1,
        annual_capacity_per_consultant: 1,
        utilization: 1,
        rate: revenue,
      }
    case 'arr_retention_expansion':
      return {
        model_type: modelType,
        opening_arr: revenue,
        gross_retention_rate: 1,
        expansion_arr: 0,
        new_arr: 0,
      }
    case 'attested_custom':
      return {
        model_type: modelType,
        model_name: 'Owner-attested operating model',
        derived_revenue: revenue,
        evidence_references: [],
      }
    case 'advisor_reviewed_custom':
      return {
        model_type: modelType,
        model_name: 'Legacy advisor-reviewed operating model',
        derived_revenue: revenue,
        evidence_references: [],
      }
    case 'units_price':
      return { model_type: modelType, units: 1, price_per_unit: revenue }
  }
}

export function NegativeEbitdaRecoveryPanel({
  formData,
  setFormData,
  reportedEbitda,
  normalizedEbitda,
  latestRevenue,
  disabled,
  formatCurrency,
  onViewAllNormalizations,
}: {
  formData: ManualValuationFormData
  setFormData: Dispatch<SetStateAction<ManualValuationFormData>>
  reportedEbitda: number
  normalizedEbitda?: number
  latestRevenue: number
  disabled: boolean
  formatCurrency: (value: number) => string
  onViewAllNormalizations?: () => void
}) {
  const locale = useLocale()
  const c = NEGATIVE_EBITDA_RECOVERY_COPY[locale === 'fr' ? 'fr' : locale === 'en' ? 'en' : 'nl']
  const result = useManualResultsStore((state) => state.result)
  const resolution = result?.negativeEbitdaResolution
  const [step, setStep] = useState<RecoveryStep>('scenarios')
  const [scenarioKey, setScenarioKey] = useState<RecoveryScenarioKey>('base')
  const trackedDetection = useRef(false)
  const trackedResolutionHash = useRef<string | null>(null)
  const draft = formData.recovery_inputs_draft
  const compilation = useMemo(() => compileRecoveryInputsDraft(draft), [draft])
  const probability = draft?.scenarios.reduce(
    (sum, scenario) => sum + scenario.probability_percent,
    0
  )
  const analyticsContext = useMemo(
    () => ({
      businessType: formData.business_type_id ?? formData.businessType,
      ebitdaBand: ebitdaBand(reportedEbitda),
      evidenceCompleteness: compilation.inputs ? ('complete' as const) : ('incomplete' as const),
      advisorReviewState: 'not_requested' as const,
    }),
    [compilation.inputs, formData, reportedEbitda]
  )

  useEffect(() => {
    if (trackedDetection.current) return
    trackedDetection.current = true
    trackNegativeEbitdaDetected({ ...analyticsContext, conversionStage: 'detected' })
  }, [analyticsContext])

  useEffect(() => {
    if (!resolution || trackedResolutionHash.current === resolution.resolutionSnapshotHash) return
    trackedResolutionHash.current = resolution.resolutionSnapshotHash
    trackRecoveryResolutionViewed({
      ...analyticsContext,
      chosenMethod: resolution.primaryMethod ?? 'none',
      trajectory: resolution.operatingTrajectory.direction,
      conversionStage: 'result',
      resolutionHash: resolution.resolutionSnapshotHash,
    })
    if (resolution.primaryMethod === 'recovery_dcf') {
      trackRecoveryDcfCompleted({
        ...analyticsContext,
        chosenMethod: resolution.primaryMethod,
        trajectory: resolution.operatingTrajectory.direction,
        conversionStage: 'result',
        resolutionHash: resolution.resolutionSnapshotHash,
      })
    } else if (resolution.candidateMethodAudit.dcf?.accepted === false) {
      trackRecoveryDcfBlocked({
        ...analyticsContext,
        chosenMethod: resolution.primaryMethod ?? 'none',
        trajectory: resolution.operatingTrajectory.direction,
        conversionStage: 'result',
        resolutionHash: resolution.resolutionSnapshotHash,
      })
    }
  }, [analyticsContext, resolution])

  const setDraft = (next: RecoveryInputsDraft) => {
    setFormData((previous) => ({
      ...previous,
      recovery_inputs_draft: {
        ...next,
        review_state: { schema_version: 'recovery_draft_review.v1', reviewed: false },
        verification_intent: { intent: 'automated_guardrails', accepted: false },
      },
      recovery_inputs: undefined,
    }))
  }
  const confirmRecoveryPlan = () => {
    if (!draft) return
    setFormData((previous) => ({
      ...previous,
      recovery_inputs_draft: reviewRecoveryInputsDraft(draft),
      recovery_inputs: undefined,
    }))
  }
  const selectedScenario = draft?.scenarios.find((scenario) => scenario.key === scenarioKey)

  const updateScenario = (
    key: RecoveryScenarioKey,
    updater: (scenario: RecoveryInputsDraft['scenarios'][number]) => void
  ) => {
    if (!draft) return
    const scenarios = draft.scenarios.map((scenario) => {
      if (scenario.key !== key) return scenario
      const copy = {
        ...scenario,
        forecast_years: scenario.forecast_years.map((row) => ({
          ...row,
          operating_driver: { ...row.operating_driver },
          evidence_references: [...row.evidence_references],
        })),
        override_evidence_references: [...scenario.override_evidence_references],
      }
      updater(copy)
      return copy
    }) as RecoveryInputsDraft['scenarios']
    setDraft({ ...draft, scenarios })
  }

  const startRecovery = () => {
    const latestYear = Math.max(
      ...formData.yearlyFinancials.map((row) => Number(row.year)).filter(Number.isFinite),
      new Date().getFullYear() - 1
    )
    const latestActual = [...formData.yearlyFinancials]
      .filter((row) => !row.isForecast)
      .sort((left, right) => Number(left.year) - Number(right.year))
      .at(-1)
    setDraft(
      createRecoveryInputsDraft({
        startYear: latestYear + 1,
        revenue: latestRevenue,
        reportedEbitda,
        verificationIntent: 'automated_guardrails',
        openingCash: typeof latestActual?.cash === 'number' ? latestActual.cash : 0,
        wacc: typeof formData.dcf_wacc_pct === 'number' ? formData.dcf_wacc_pct / 100 : undefined,
        terminalGrowthRate:
          typeof formData.dcf_terminal_growth_pct === 'number'
            ? formData.dcf_terminal_growth_pct / 100
            : undefined,
      })
    )
    trackNormalizationBridgeCompleted({
      ...analyticsContext,
      conversionStage: 'normalization_complete',
    })
    trackRecoveryDcfStarted({ ...analyticsContext, conversionStage: 'scenarios' })
  }

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/40 shadow-sm">
      <div className="border-b border-amber-200 bg-white/80 px-5 py-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-amber-100 p-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              {c.eyebrow}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-neutral-950">{c.title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">{c.intro}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Metric label={c.reported} value={formatCurrency(reportedEbitda)} tone="warning" />
          <Metric
            label={c.normalized}
            value={typeof normalizedEbitda === 'number' ? formatCurrency(normalizedEbitda) : '—'}
            tone={
              typeof normalizedEbitda === 'number' && normalizedEbitda > 0 ? 'positive' : 'plain'
            }
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {onViewAllNormalizations && (
            <button
              type="button"
              onClick={onViewAllNormalizations}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-800 hover:border-neutral-300"
            >
              {c.normalization}
            </button>
          )}
          {!draft?.enabled && (
            <button
              type="button"
              onClick={startRecovery}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#C95F3B] px-3 py-2 text-sm font-semibold text-white hover:bg-[#B85232] disabled:opacity-50"
            >
              {c.start} <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {draft?.enabled && (
        <div className="bg-white px-5 py-5">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={c.eyebrow}>
            {(['scenarios', 'funding', 'assumptions', 'verification'] as RecoveryStep[]).map(
              (item) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={step === item}
                  key={item}
                  onClick={() => setStep(item)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    step === item
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {c[item]}
                </button>
              )
            )}
            <span
              className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                probability === 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              }`}
            >
              {probability === 100 ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" />
              )}
              {probability === 100 ? c.probabilityOk : `${c.probabilityBad} (${probability ?? 0}%)`}
            </span>
          </div>

          {step === 'scenarios' && selectedScenario && (
            <div className="mt-5">
              <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
                {c.generatedSuggestion}
              </p>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex gap-2" role="tablist" aria-label={c.scenarios}>
                  {draft.scenarios.map((scenario) => (
                    <button
                      type="button"
                      key={scenario.key}
                      onClick={() => setScenarioKey(scenario.key)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium capitalize ${
                        scenario.key === scenarioKey
                          ? 'border-[#D97853] bg-[#FFF6F1] text-[#9F472A]'
                          : 'border-neutral-200 bg-white text-neutral-600'
                      }`}
                    >
                      {scenario.key}
                    </button>
                  ))}
                </div>
                <label className="w-32 text-xs font-medium text-neutral-600">
                  {c.probability}
                  <div className="mt-1 flex items-center gap-1">
                    <input
                      className={recoveryInputClass}
                      type="number"
                      min={1}
                      max={100}
                      value={selectedScenario.probability_percent}
                      onChange={(event) =>
                        updateScenario(scenarioKey, (scenario) => {
                          scenario.probability_percent = Number(event.target.value)
                        })
                      }
                    />
                    <span>%</span>
                  </div>
                </label>
              </div>

              <div
                className="mt-4 space-y-3"
                onBlur={() =>
                  trackRecoveryScenarioUpdated({
                    ...analyticsContext,
                    conversionStage: `scenario_${scenarioKey}`,
                  })
                }
              >
                {selectedScenario.forecast_years.map((row, rowIndex) => {
                  const derivedRevenue = recoveryDriverRevenue(row.operating_driver)
                  const reconciled =
                    Math.abs(derivedRevenue - row.revenue) <= Math.max(1, row.revenue * 0.005)
                  const driver = row.operating_driver
                  return (
                    <div key={row.year} className="rounded-xl border border-neutral-200 p-3">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <NumberField label={c.year} value={row.year} disabled />
                        <NumberField
                          label={c.revenue}
                          value={row.revenue}
                          onChange={(value) =>
                            updateScenario(scenarioKey, (scenario) => {
                              scenario.forecast_years[rowIndex].revenue = value
                            })
                          }
                        />
                        <NumberField
                          label={c.opex}
                          value={row.operating_expenses_excluding_da}
                          onChange={(value) =>
                            updateScenario(scenarioKey, (scenario) => {
                              scenario.forecast_years[rowIndex].operating_expenses_excluding_da =
                                value
                            })
                          }
                        />
                        <NumberField
                          label={c.da}
                          value={row.depreciation_and_amortization}
                          onChange={(value) =>
                            updateScenario(scenarioKey, (scenario) => {
                              scenario.forecast_years[rowIndex].depreciation_and_amortization =
                                value
                            })
                          }
                        />
                        <NumberField
                          label={c.tax}
                          value={row.tax_rate * 100}
                          onChange={(value) =>
                            updateScenario(scenarioKey, (scenario) => {
                              scenario.forecast_years[rowIndex].tax_rate = value / 100
                            })
                          }
                        />
                        <NumberField
                          label={c.nol}
                          value={row.nol_opening}
                          onChange={(value) =>
                            updateScenario(scenarioKey, (scenario) => {
                              scenario.forecast_years[rowIndex].nol_opening = value
                            })
                          }
                        />
                        <NumberField
                          label={c.capex}
                          value={row.capex}
                          onChange={(value) =>
                            updateScenario(scenarioKey, (scenario) => {
                              scenario.forecast_years[rowIndex].capex = value
                            })
                          }
                        />
                        <NumberField
                          label={c.nwc}
                          value={row.delta_nwc}
                          onChange={(value) =>
                            updateScenario(scenarioKey, (scenario) => {
                              scenario.forecast_years[rowIndex].delta_nwc = value
                            })
                          }
                        />
                        <label className="text-xs font-medium text-neutral-600 sm:col-span-2">
                          {c.driverModel}
                          <select
                            className={`${recoveryInputClass} mt-1`}
                            value={driver.model_type}
                            onChange={(event) =>
                              updateScenario(scenarioKey, (scenario) => {
                                scenario.forecast_years[rowIndex].operating_driver =
                                  createOperatingDriver(
                                    event.target.value as RecoveryOperatingDriver['model_type'],
                                    row.revenue
                                  )
                              })
                            }
                          >
                            <option value="customer_acv">{c.customerAcv}</option>
                            <option value="consultant_capacity">{c.consultantCapacity}</option>
                            <option value="arr_retention_expansion">{c.arrRetention}</option>
                            <option value="units_price">{c.unitsPrice}</option>
                            <option value="attested_custom">{c.customDriver}</option>
                          </select>
                        </label>
                        {driver.model_type === 'units_price' && (
                          <>
                            <NumberField
                              label={c.units}
                              value={driver.units}
                              onChange={(value) =>
                                updateScenario(scenarioKey, (scenario) => {
                                  scenario.forecast_years[rowIndex].operating_driver = {
                                    ...driver,
                                    units: value,
                                  }
                                })
                              }
                            />
                            <NumberField
                              label={c.price}
                              value={driver.price_per_unit}
                              onChange={(value) =>
                                updateScenario(scenarioKey, (scenario) => {
                                  scenario.forecast_years[rowIndex].operating_driver = {
                                    ...driver,
                                    price_per_unit: value,
                                  }
                                })
                              }
                            />
                          </>
                        )}
                        {driver.model_type === 'customer_acv' && (
                          <>
                            <NumberField
                              label={c.customers}
                              value={driver.customers}
                              onChange={(value) =>
                                updateScenario(scenarioKey, (scenario) => {
                                  scenario.forecast_years[rowIndex].operating_driver = {
                                    ...driver,
                                    customers: value,
                                  }
                                })
                              }
                            />
                            <NumberField
                              label={c.acv}
                              value={driver.annual_contract_value}
                              onChange={(value) =>
                                updateScenario(scenarioKey, (scenario) => {
                                  scenario.forecast_years[rowIndex].operating_driver = {
                                    ...driver,
                                    annual_contract_value: value,
                                  }
                                })
                              }
                            />
                          </>
                        )}
                        {driver.model_type === 'consultant_capacity' && (
                          <>
                            <NumberField
                              label={c.consultants}
                              value={driver.consultants}
                              onChange={(value) =>
                                updateScenario(scenarioKey, (scenario) => {
                                  scenario.forecast_years[rowIndex].operating_driver = {
                                    ...driver,
                                    consultants: value,
                                  }
                                })
                              }
                            />
                            <NumberField
                              label={c.annualCapacity}
                              value={driver.annual_capacity_per_consultant}
                              onChange={(value) =>
                                updateScenario(scenarioKey, (scenario) => {
                                  scenario.forecast_years[rowIndex].operating_driver = {
                                    ...driver,
                                    annual_capacity_per_consultant: value,
                                  }
                                })
                              }
                            />
                            <NumberField
                              label={c.utilization}
                              value={driver.utilization * 100}
                              onChange={(value) =>
                                updateScenario(scenarioKey, (scenario) => {
                                  scenario.forecast_years[rowIndex].operating_driver = {
                                    ...driver,
                                    utilization: value / 100,
                                  }
                                })
                              }
                            />
                            <NumberField
                              label={c.rate}
                              value={driver.rate}
                              onChange={(value) =>
                                updateScenario(scenarioKey, (scenario) => {
                                  scenario.forecast_years[rowIndex].operating_driver = {
                                    ...driver,
                                    rate: value,
                                  }
                                })
                              }
                            />
                          </>
                        )}
                        {driver.model_type === 'arr_retention_expansion' && (
                          <>
                            <NumberField
                              label={c.openingArr}
                              value={driver.opening_arr}
                              onChange={(value) =>
                                updateScenario(scenarioKey, (scenario) => {
                                  scenario.forecast_years[rowIndex].operating_driver = {
                                    ...driver,
                                    opening_arr: value,
                                  }
                                })
                              }
                            />
                            <NumberField
                              label={c.retention}
                              value={driver.gross_retention_rate * 100}
                              onChange={(value) =>
                                updateScenario(scenarioKey, (scenario) => {
                                  scenario.forecast_years[rowIndex].operating_driver = {
                                    ...driver,
                                    gross_retention_rate: value / 100,
                                  }
                                })
                              }
                            />
                            <NumberField
                              label={c.expansionArr}
                              value={driver.expansion_arr}
                              onChange={(value) =>
                                updateScenario(scenarioKey, (scenario) => {
                                  scenario.forecast_years[rowIndex].operating_driver = {
                                    ...driver,
                                    expansion_arr: value,
                                  }
                                })
                              }
                            />
                            <NumberField
                              label={c.newArr}
                              value={driver.new_arr}
                              onChange={(value) =>
                                updateScenario(scenarioKey, (scenario) => {
                                  scenario.forecast_years[rowIndex].operating_driver = {
                                    ...driver,
                                    new_arr: value,
                                  }
                                })
                              }
                            />
                          </>
                        )}
                        {(driver.model_type === 'attested_custom' ||
                          driver.model_type === 'advisor_reviewed_custom') && (
                          <>
                            <TextField
                              label={c.modelName}
                              value={driver.model_name}
                              onChange={(value) =>
                                updateScenario(scenarioKey, (scenario) => {
                                  scenario.forecast_years[rowIndex].operating_driver = {
                                    ...driver,
                                    model_name: value,
                                  }
                                })
                              }
                            />
                            <NumberField
                              label={c.derivedRevenue}
                              value={driver.derived_revenue}
                              onChange={(value) =>
                                updateScenario(scenarioKey, (scenario) => {
                                  scenario.forecast_years[rowIndex].operating_driver = {
                                    ...driver,
                                    derived_revenue: value,
                                  }
                                })
                              }
                            />
                            <div className="sm:col-span-2">
                              <TextField
                                label={c.customEvidence}
                                value={driver.evidence_references.join(', ')}
                                onChange={(value) =>
                                  updateScenario(scenarioKey, (scenario) => {
                                    scenario.forecast_years[rowIndex].operating_driver = {
                                      ...driver,
                                      evidence_references: parseRecoveryEvidence(value),
                                    }
                                  })
                                }
                              />
                            </div>
                          </>
                        )}
                        <div className="sm:col-span-2 lg:col-span-4">
                          <TextField
                            label={c.evidence}
                            value={row.evidence_references.join(', ')}
                            onChange={(value) =>
                              updateScenario(scenarioKey, (scenario) => {
                                scenario.forecast_years[rowIndex].evidence_references =
                                  parseRecoveryEvidence(value)
                              })
                            }
                          />
                        </div>
                      </div>
                      <p
                        className={`mt-2 text-xs font-medium ${
                          reconciled ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {reconciled ? c.reconciled : c.unreconciled}:{' '}
                        {formatCurrency(derivedRevenue)}
                      </p>
                    </div>
                  )
                })}
              </div>
              {selectedScenario.forecast_years.length < 10 && (
                <button
                  type="button"
                  onClick={() =>
                    updateScenario(scenarioKey, (scenario) => {
                      const previous = scenario.forecast_years.at(-1)
                      if (!previous) return
                      scenario.forecast_years.push({
                        ...previous,
                        year: previous.year + 1,
                        operating_driver: { ...previous.operating_driver },
                        evidence_references: [],
                      })
                    })
                  }
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#A44B2E]"
                >
                  <Plus className="h-4 w-4" /> {c.addYear}
                </button>
              )}
            </div>
          )}

          <RecoveryFundingAndAssumptions step={step} draft={draft} setDraft={setDraft} copy={c} />
          {step === 'verification' && (
            <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-neutral-700" />
                <p className="text-sm leading-6 text-neutral-700">{c.automaticReview}</p>
              </div>
              {!draft.review_state?.reviewed && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={confirmRecoveryPlan}
                  className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-neutral-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" /> {c.reviewPlan}
                </button>
              )}
              <div
                className={`mt-4 rounded-lg px-3 py-2 text-sm ${
                  compilation.inputs
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-amber-50 text-amber-800'
                }`}
              >
                {compilation.inputs
                  ? c.reviewed
                  : `${c.missing}: ${compilation.issues.slice(0, 5).join(', ')}`}
              </div>
            </div>
          )}
        </div>
      )}

      {resolution && (
        <RecoveryResolutionPanel resolution={resolution} copy={c} formatCurrency={formatCurrency} />
      )}
    </section>
  )
}
