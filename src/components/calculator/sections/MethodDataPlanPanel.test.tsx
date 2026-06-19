import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MethodWeightsDataPlan } from '@/types/methodDataPlan'
import { MethodDataPlanPanel } from './MethodDataPlanPanel'

// next-intl echoes the key so assertions can target stable strings.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Controllable BET-312 door capability (hoisted so the mock factory can read it).
const { doorsEnabledRef } = vi.hoisted(() => ({ doorsEnabledRef: { value: false } }))
vi.mock('@/config/features', () => ({
  isBet312AutofillDoorsEnabled: () => doorsEnabledRef.value,
}))

// Tiny method-label map so the test doesn't pull the whole method registry.
vi.mock('@/constants/methodLabels', () => ({
  METHOD_LABEL_KEYS: {
    ebitda_multiple: 'manualInput.methodSelector.ebitdaMultiple',
    dcf: 'manualInput.methodSelector.dcf',
  },
}))

const planNeedingInput: MethodWeightsDataPlan = {
  nextDataAction: 'provide_method_inputs',
  unlockHint: 'Provide the inputs below to firm up the blend.',
  perMethod: [
    { method: 'ebitda_multiple', fieldsToCollect: ['ebitda', 'net_debt'] },
    { method: 'dcf', fieldsToCollect: [] }, // already unlocked → not listed
  ],
}

describe('MethodDataPlanPanel', () => {
  afterEach(() => {
    cleanup()
    doorsEnabledRef.value = false
    vi.clearAllMocks()
  })

  it('renders nothing when there is no plan (dormant)', () => {
    const { container } = render(<MethodDataPlanPanel methodDataPlan={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the plan has no methods', () => {
    const { container } = render(
      <MethodDataPlanPanel
        methodDataPlan={{ nextDataAction: 'none', unlockHint: null, perMethod: [] }}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('lists prettified fields-to-collect only for methods that still need input', () => {
    render(<MethodDataPlanPanel methodDataPlan={planNeedingInput} />)
    expect(screen.getByText('Ebitda')).toBeInTheDocument()
    expect(screen.getByText('Net Debt')).toBeInTheDocument()
    expect(screen.getByText('Provide the inputs below to firm up the blend.')).toBeInTheDocument()
  })

  it('shows the all-unlocked message when no method needs input', () => {
    render(
      <MethodDataPlanPanel
        methodDataPlan={{
          nextDataAction: 'none',
          unlockHint: null,
          perMethod: [{ method: 'dcf', fieldsToCollect: [] }],
        }}
      />
    )
    expect(screen.getByText('methodDataPlan.allUnlocked')).toBeInTheDocument()
  })

  it('greys the BET-312 doors with a coming-soon badge while the flag is off', () => {
    render(<MethodDataPlanPanel methodDataPlan={planNeedingInput} />)
    expect(screen.getByText('methodDataPlan.comingSoon')).toBeInTheDocument()
    expect(
      screen.getByText('methodDataPlan.doors.connectAccounting').closest('button')
    ).toBeDisabled()
    expect(
      screen.getByText('methodDataPlan.doors.inviteAccountant').closest('button')
    ).toBeDisabled()
  })

  it('enables the doors and drops the badge when the BET-312 flag is on', () => {
    doorsEnabledRef.value = true
    render(<MethodDataPlanPanel methodDataPlan={planNeedingInput} />)
    expect(screen.queryByText('methodDataPlan.comingSoon')).not.toBeInTheDocument()
    expect(
      screen.getByText('methodDataPlan.doors.connectAccounting').closest('button')
    ).not.toBeDisabled()
  })
})
