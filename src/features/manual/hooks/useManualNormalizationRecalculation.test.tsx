import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizationItem, ValuationReportData } from '../../../components/calculator'
import { valuationService } from '../../../services'
import { useManualFormStore } from '../../../store/manual/useManualFormStore'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { useTaxLatencyStore } from '../../../store/useTaxLatencyStore'
import type { CollectedData } from '../components/manualLayoutDataTypes'
import { useManualNormalizationRecalculation } from './useManualNormalizationRecalculation'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

// The engine call is the thing under test: resolving no result stops the run right after it.
vi.mock('../../../services', () => ({
  reportAssetService: { saveReportAssets: vi.fn() },
  valuationService: { calculateValuation: vi.fn() },
}))

vi.mock('../../../utils/normalizationPersist', () => ({
  persistOrDeleteNormalizationsForYears: vi.fn().mockResolvedValue(undefined),
}))

const acceptedNormalization: NormalizationItem = {
  id: 'norm-1',
  ledgerCode: '618',
  ledgerName: 'Management fee',
  category: 'salary',
  type: 'add',
  value: 0,
  adjustment: 12_000,
  source: 'manual',
  status: 'accepted',
  applyAllYears: false,
  year: 2025,
}

const initialNormalizationSnapshot = useNormalizationStore.getState()
const initialTaxLatencySnapshot = useTaxLatencyStore.getState()

/** A report already on screen, for a company whose headcount is `fteEmployees`. */
function renderRecalculation(fteEmployees: number | undefined) {
  const collectedData: CollectedData = {
    companyName: 'Acme',
    businessType: 'consulting',
    businessStructure: 'bv',
    country: 'BE',
    ownerManagers: 1,
    fteEmployees,
  }
  return renderHook(() =>
    useManualNormalizationRecalculation<CollectedData>({
      accountantCustomerId: null,
      calculationRequestIdentifiers: {},
      collectedData,
      currentLocale: 'en',
      financialYears: [2025],
      formStoreData: { ...useManualFormStore.getState().formData, company_name: 'Acme' },
      latestFormDataRef: {
        current: {
          fteEmployees,
          yearlyFinancials: [{ year: '2025', revenue: 1_000_000, ebitda: 100_000 }],
        },
      },
      originalEBITDAByYear: { 2025: 100_000 },
      preSelectedMethod: null,
      report: {} as ValuationReportData,
      reportId: 'val_1_demo',
      resolvedReportId: null,
      selectedMethod: 'upswitch_adaptive',
      sessionName: null,
      durableSaveInFlightRef: { current: false },
      setDraftStatus: vi.fn(),
      setLastSaved: vi.fn(),
      setResult: vi.fn(),
      synthesisSelection: { preSelectedMethods: [], userWeights: {} },
      translate: (key: string) => key,
      translatePreparer: (key: string) => key,
    })
  )
}

function addUserTaxLatency() {
  useTaxLatencyStore.getState().addItem({
    id: 'latency-1',
    type: 'passive',
    description: 'Revaluation reserve',
    temporaryDifference: 1000,
    taxRate: 25,
  })
}

// P2-2: these recalculations bypass Calculate, so a report whose headcount is empty (a
// legacy session, or a cleared field) was recalculated and saved without one — and the
// save receipt then let the return to Mercury announce "valuation added".
describe('useManualNormalizationRecalculation headcount', () => {
  beforeEach(() => {
    vi.mocked(toast.warning).mockClear()
    vi.mocked(valuationService.calculateValuation)
      .mockReset()
      .mockResolvedValue(null as never)
  })

  afterEach(() => {
    vi.useRealTimers()
    useNormalizationStore.setState(initialNormalizationSnapshot, true)
    useTaxLatencyStore.setState(initialTaxLatencySnapshot, true)
  })

  it('keeps an accepted normalization but asks for the headcount instead of recalculating', async () => {
    const { result } = renderRecalculation(undefined)

    await act(async () => {
      await result.current.handleNormalizationsChange([acceptedNormalization])
    })

    expect(useNormalizationStore.getState().items).toEqual([acceptedNormalization])
    expect(valuationService.calculateValuation).not.toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalledWith('employeeCountMissing', {
      description: 'employeeCountMissingDesc',
    })
  })

  it('recalculates with the headcount the advisor typed, 0 included', async () => {
    const { result } = renderRecalculation(0)

    await act(async () => {
      await result.current.handleNormalizationsChange([acceptedNormalization])
    })

    expect(toast.warning).not.toHaveBeenCalled()
    expect(valuationService.calculateValuation).toHaveBeenCalledTimes(1)
    expect(vi.mocked(valuationService.calculateValuation).mock.calls[0]?.[0]).toMatchObject({
      number_of_employees: 0,
    })
  })

  it('asks for the headcount instead of recalculating after a tax-latency edit', async () => {
    vi.useFakeTimers()
    renderRecalculation(undefined)

    act(() => addUserTaxLatency())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect(valuationService.calculateValuation).not.toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalledWith('employeeCountMissing', {
      description: 'employeeCountMissingDesc',
    })
  })

  it('recalculates after a tax-latency edit when the headcount is known', async () => {
    vi.useFakeTimers()
    renderRecalculation(4)

    act(() => addUserTaxLatency())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect(toast.warning).not.toHaveBeenCalled()
    expect(valuationService.calculateValuation).toHaveBeenCalledTimes(1)
  })
})
