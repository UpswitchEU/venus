'use client'

import { Plus } from 'lucide-react'
import type { NegativeEbitdaResolution, RecoveryInputsDraft } from '@/types/valuation'

export const recoveryInputClass =
  'h-9 w-full rounded-lg border border-neutral-200 bg-white px-2 text-sm text-neutral-900 outline-none transition focus:border-[#D97853] focus:ring-2 focus:ring-[#D97853]/15 disabled:bg-neutral-50'

export function parseRecoveryEvidence(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

type RecoverySupportCopy = Record<
  | 'openingCash'
  | 'minimumCash'
  | 'amount'
  | 'timing'
  | 'source'
  | 'evidence'
  | 'addCommitment'
  | 'wacc'
  | 'growth'
  | 'assumptionEvidence'
  | 'result'
  | 'noRange'
  | 'currentEquity'
  | 'enterpriseValue'
  | 'primaryMethod'
  | 'crossChecks'
  | 'conflicts'
  | 'qualifications'
  | 'fundingGap'
  | 'breakEven'
  | 'terminalShare'
  | 'blockers'
  | 'evidenceNeeded'
  | 'actions'
  | 'scenarioOutcome'
  | 'probability',
  string
>

export function RecoveryFundingAndAssumptions({
  step,
  draft,
  setDraft,
  copy: c,
}: {
  step: 'scenarios' | 'funding' | 'assumptions' | 'verification'
  draft: RecoveryInputsDraft
  setDraft: (next: RecoveryInputsDraft) => void
  copy: RecoverySupportCopy
}) {
  return (
    <>
      {step === 'funding' && (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField
              label={c.openingCash}
              value={draft.funding_plan.opening_cash}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  funding_plan: { ...draft.funding_plan, opening_cash: value },
                })
              }
            />
            <NumberField
              label={c.minimumCash}
              value={draft.funding_plan.minimum_cash}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  funding_plan: { ...draft.funding_plan, minimum_cash: value },
                })
              }
            />
          </div>
          <TextField
            label={c.evidence}
            value={draft.funding_plan.evidence_references.join(', ')}
            onChange={(value) =>
              setDraft({
                ...draft,
                funding_plan: {
                  ...draft.funding_plan,
                  evidence_references: parseRecoveryEvidence(value),
                },
              })
            }
          />
          {draft.funding_plan.commitments.map((commitment, index) => (
            <div
              key={`${commitment.available_year}-${index}`}
              className="grid gap-3 rounded-xl border border-neutral-200 p-3 sm:grid-cols-2"
            >
              <NumberField
                label={c.amount}
                value={commitment.amount}
                onChange={(value) => {
                  const commitments = [...draft.funding_plan.commitments]
                  commitments[index] = { ...commitment, amount: value }
                  setDraft({ ...draft, funding_plan: { ...draft.funding_plan, commitments } })
                }}
              />
              <NumberField
                label={c.timing}
                value={commitment.available_year}
                onChange={(value) => {
                  const commitments = [...draft.funding_plan.commitments]
                  commitments[index] = { ...commitment, available_year: value }
                  setDraft({ ...draft, funding_plan: { ...draft.funding_plan, commitments } })
                }}
              />
              <label className="text-xs font-medium text-neutral-600">
                {c.source}
                <select
                  className={`${recoveryInputClass} mt-1`}
                  value={commitment.source}
                  onChange={(event) => {
                    const commitments = [...draft.funding_plan.commitments]
                    commitments[index] = {
                      ...commitment,
                      source: event.target.value as typeof commitment.source,
                    }
                    setDraft({ ...draft, funding_plan: { ...draft.funding_plan, commitments } })
                  }}
                >
                  {['shareholder', 'bank', 'investor', 'grant', 'operating_facility', 'other'].map(
                    (source) => (
                      <option key={source} value={source}>
                        {source.replace('_', ' ')}
                      </option>
                    )
                  )}
                </select>
              </label>
              <TextField
                label={c.evidence}
                value={commitment.evidence_references.join(', ')}
                onChange={(value) => {
                  const commitments = [...draft.funding_plan.commitments]
                  commitments[index] = {
                    ...commitment,
                    evidence_references: parseRecoveryEvidence(value),
                  }
                  setDraft({ ...draft, funding_plan: { ...draft.funding_plan, commitments } })
                }}
              />
            </div>
          ))}
          {draft.funding_plan.commitments.length < 20 && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#A44B2E]"
              onClick={() => {
                const year = draft.scenarios[0]?.forecast_years[0]?.year ?? new Date().getFullYear()
                setDraft({
                  ...draft,
                  funding_plan: {
                    ...draft.funding_plan,
                    commitments: [
                      ...draft.funding_plan.commitments,
                      {
                        amount: 0,
                        available_year: year,
                        source: 'shareholder',
                        evidence_references: [],
                      },
                    ],
                  },
                })
              }}
            >
              <Plus className="h-4 w-4" /> {c.addCommitment}
            </button>
          )}
        </div>
      )}

      {step === 'assumptions' && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <NumberField
            label={c.wacc}
            value={draft.governed_assumptions.wacc * 100}
            onChange={(value) =>
              setDraft({
                ...draft,
                governed_assumptions: {
                  ...draft.governed_assumptions,
                  wacc: value / 100,
                },
              })
            }
          />
          <NumberField
            label={c.growth}
            value={draft.governed_assumptions.terminal_growth_rate * 100}
            onChange={(value) =>
              setDraft({
                ...draft,
                governed_assumptions: {
                  ...draft.governed_assumptions,
                  terminal_growth_rate: value / 100,
                },
              })
            }
          />
          <div className="sm:col-span-2">
            <TextField
              label={c.assumptionEvidence}
              value={draft.governed_assumptions.evidence_references.join(', ')}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  governed_assumptions: {
                    ...draft.governed_assumptions,
                    evidence_references: parseRecoveryEvidence(value),
                  },
                })
              }
            />
          </div>
        </div>
      )}
    </>
  )
}

export function RecoveryResolutionPanel({
  resolution,
  copy: c,
  formatCurrency,
}: {
  resolution: NegativeEbitdaResolution
  copy: RecoverySupportCopy
  formatCurrency: (value: number) => string
}) {
  return (
    <>
      {resolution && (
        <div className="border-t border-amber-200 bg-neutral-950 px-5 py-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
            {c.result}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">
              {resolution.primaryMethod ? resolution.status.replaceAll('_', ' ') : c.noRange}
            </h3>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
              {resolution.confidence} confidence
            </span>
          </div>
          {resolution.primaryMethod && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <DarkMetric
                label={c.primaryMethod}
                value={resolution.primaryMethod.replaceAll('_', ' ')}
              />
              <DarkMetric
                label={c.enterpriseValue}
                value={formatRange(
                  resolution.headlineEnterpriseValueLow,
                  resolution.headlineEnterpriseValueHigh,
                  formatCurrency
                )}
              />
              <DarkMetric
                label={c.currentEquity}
                value={formatRange(
                  resolution.headlineEquityValueLow,
                  resolution.headlineEquityValueHigh,
                  formatCurrency
                )}
              />
            </div>
          )}
          {resolution.crossCheckMethods.length > 0 && (
            <p className="mt-3 text-sm text-neutral-300">
              <span className="font-medium text-white">{c.crossChecks}:</span>{' '}
              {resolution.crossCheckMethods.join(', ').replaceAll('_', ' ')}
            </p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <DarkMetric label={c.breakEven} value={resolution.breakEvenYear?.toString() ?? '—'} />
            <DarkMetric
              label={c.fundingGap}
              value={
                resolution.fundingGap == null ? '—' : formatCurrency(Number(resolution.fundingGap))
              }
            />
            <DarkMetric
              label={c.terminalShare}
              value={
                resolution.terminalValueShare == null
                  ? '—'
                  : `${(Number(resolution.terminalValueShare) * 100).toFixed(0)}%`
              }
            />
          </div>
          {resolution.scenarioResults.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-white/5 text-xs uppercase tracking-wide text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">{c.scenarioOutcome}</th>
                    <th className="px-3 py-2">{c.probability}</th>
                    <th className="px-3 py-2">{c.breakEven}</th>
                    <th className="px-3 py-2">{c.fundingGap}</th>
                    <th className="px-3 py-2">{c.enterpriseValue}</th>
                    <th className="px-3 py-2">{c.currentEquity}</th>
                  </tr>
                </thead>
                <tbody>
                  {resolution.scenarioResults.map((scenario) => (
                    <tr key={scenario.key} className="border-t border-white/10">
                      <td className="px-3 py-2 capitalize">{scenario.key}</td>
                      <td className="px-3 py-2">{Number(scenario.probabilityPercent)}%</td>
                      <td className="px-3 py-2">{scenario.breakEvenYear ?? '—'}</td>
                      <td className="px-3 py-2">{formatCurrency(Number(scenario.fundingGap))}</td>
                      <td className="px-3 py-2">
                        {scenario.enterpriseValueMid == null
                          ? '—'
                          : formatCurrency(Number(scenario.enterpriseValueMid))}
                      </td>
                      <td className="px-3 py-2">
                        {scenario.equityValueMid == null
                          ? '—'
                          : formatCurrency(Number(scenario.equityValueMid))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {resolution.operatingTrajectory.conflicts.length > 0 && (
            <CodeList title={c.conflicts} values={resolution.operatingTrajectory.conflicts} />
          )}
          {typeof resolution.equityBridge?.qualification === 'string' && (
            <CodeList title={c.qualifications} values={[resolution.equityBridge.qualification]} />
          )}
          {resolution.blockers.length > 0 && (
            <CodeList title={c.blockers} values={resolution.blockers} />
          )}
          {resolution.requiredEvidence.length > 0 && (
            <CodeList title={c.evidenceNeeded} values={resolution.requiredEvidence} />
          )}
          {resolution.valueBuildingActions.length > 0 && (
            <CodeList title={c.actions} values={resolution.valueBuildingActions} />
          )}
        </div>
      )}{' '}
    </>
  )
}

function formatRange(
  low: string | number | null | undefined,
  high: string | number | null | undefined,
  formatCurrency: (value: number) => string
): string {
  if (low == null || high == null) return '—'
  return `${formatCurrency(Number(low))} – ${formatCurrency(Number(high))}`
}

export function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: number
  onChange?: (value: number) => void
  disabled?: boolean
}) {
  return (
    <label className="text-xs font-medium text-neutral-600">
      {label}
      <input
        className={`${recoveryInputClass} mt-1 tabular-nums`}
        type="number"
        value={Number.isFinite(value) ? value : ''}
        onChange={(event) => onChange?.(Number(event.target.value))}
        disabled={disabled}
      />
    </label>
  )
}

export function TextField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="text-xs font-medium text-neutral-600">
      {label}
      <input
        className={`${recoveryInputClass} mt-1`}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

export function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'warning' | 'positive' | 'plain'
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tone === 'warning'
            ? 'text-rose-700'
            : tone === 'positive'
              ? 'text-emerald-700'
              : 'text-neutral-900'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function DarkMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-3">
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="mt-1 font-semibold tabular-nums text-white">{value}</p>
    </div>
  )
}

function CodeList({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</p>
      <ul className="mt-2 grid gap-1 text-sm text-neutral-200 sm:grid-cols-2">
        {values.map((value) => (
          <li key={value}>• {value.replaceAll('_', ' ')}</li>
        ))}
      </ul>
    </div>
  )
}
