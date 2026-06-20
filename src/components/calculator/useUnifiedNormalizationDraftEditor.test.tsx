import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LedgerAccount } from '../../constants/grootboek'
import type { NormalizationItem } from './UnifiedNormalizationTypes'
import { useUnifiedNormalizationDraftEditor } from './useUnifiedNormalizationDraftEditor'

const trackNormalizationAdd = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/lib/analytics', () => ({
  trackNormalizationAdd: (...args: unknown[]) => trackNormalizationAdd(...args),
}))

vi.mock('@/utils/scrollContainer', () => ({
  scrollElementIntoContainer: vi.fn(),
}))

const translate = (key: string) => key

const ledgers: LedgerAccount[] = [
  { code: '620', name: 'Bezoldigingen directie' },
  { code: '613', name: 'Advieskosten' },
]

function makeNormalization(overrides: Partial<NormalizationItem> = {}): NormalizationItem {
  return {
    id: 'norm-1',
    ledgerCode: '620',
    ledgerName: 'Bezoldigingen directie',
    category: 'salary',
    type: 'add',
    value: 25_000,
    adjustment: 25_000,
    reason: 'Above market',
    source: 'manual',
    status: 'accepted',
    applyAllYears: false,
    applyYears: [2025],
    year: 2025,
    ...overrides,
  }
}

function setup(overrides: Partial<Parameters<typeof useUnifiedNormalizationDraftEditor>[0]> = {}) {
  const onNormalizationsChange = vi.fn()
  const params = {
    open: true,
    currentYear: 2025,
    initialSearchQuery: '',
    initialYearFilter: null,
    availableYears: [2025, 2024],
    ledgerAccounts: ledgers,
    countryCode: 'BE',
    normalizations: [],
    onNormalizationsChange,
    safeOriginalEBITDA: 100_000,
    translate,
    ...overrides,
  } satisfies Parameters<typeof useUnifiedNormalizationDraftEditor>[0]

  const hook = renderHook(
    (nextParams: Parameters<typeof useUnifiedNormalizationDraftEditor>[0]) =>
      useUnifiedNormalizationDraftEditor(nextParams),
    { initialProps: params }
  )

  return { ...hook, onNormalizationsChange, params }
}

describe('useUnifiedNormalizationDraftEditor', () => {
  beforeEach(() => {
    trackNormalizationAdd.mockClear()
  })

  it('parses prompt ledger code and amount without treating the ledger code as the amount', () => {
    const { result } = setup()

    act(() => {
      result.current.handlePromptSubmit('normaliseer 620 met 75k')
    })

    expect(result.current.selectedLedger).toMatchObject({
      code: '620',
      name: 'Bezoldigingen directie',
    })
    expect(result.current.newValue).toBe('75000')
    expect(result.current.showAddForm).toBe(true)
    expect(result.current.showLedgerDropdown).toBe(false)
  })

  it('creates an accepted manual normalization and resets the draft', () => {
    const { result, onNormalizationsChange } = setup()

    act(() => {
      result.current.selectLedgerAccount({ code: '620', name: 'Bezoldigingen directie' })
    })
    act(() => {
      result.current.setNewValue('60000')
      result.current.setNewReason('Owner compensation above market')
      result.current.setNewSelectedYears([2025, 2024])
    })
    act(() => {
      result.current.addNormalization()
    })

    expect(onNormalizationsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        ledgerCode: '620',
        ledgerName: 'Bezoldigingen directie',
        category: 'salary',
        value: 60_000,
        adjustment: 60_000,
        reason: 'Owner compensation above market',
        source: 'manual',
        status: 'accepted',
        applyAllYears: true,
        applyYears: [2025, 2024],
        year: 2025,
      }),
    ])
    expect(trackNormalizationAdd).toHaveBeenCalledWith('manual')
    expect(result.current.selectedLedger).toBeNull()
    expect(result.current.showAddForm).toBe(false)
    expect(result.current.newValue).toBe('')
  })

  it('updates an edited normalization instead of creating a new one', () => {
    const existing = makeNormalization()
    const { result, onNormalizationsChange } = setup({ normalizations: [existing] })

    act(() => {
      result.current.startEditing(existing)
    })
    act(() => {
      result.current.setNewValue('30000')
      result.current.setNewReason('Updated reason')
    })
    act(() => {
      result.current.addNormalization()
    })

    expect(onNormalizationsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'norm-1',
        value: 30_000,
        adjustment: 30_000,
        reason: 'Updated reason',
      }),
    ])
    expect(trackNormalizationAdd).not.toHaveBeenCalled()
    expect(result.current.editingId).toBeNull()
  })

  it('clears stale draft state when the modal closes', () => {
    const { result, rerender, params } = setup({
      initialSearchQuery: '620',
      initialYearFilter: 2025,
    })

    act(() => {
      result.current.selectLedgerAccount({ code: '620', name: 'Bezoldigingen directie' })
    })
    expect(result.current.showAddForm).toBe(true)

    rerender({ ...params, open: false })

    expect(result.current.selectedLedger).toBeNull()
    expect(result.current.showAddForm).toBe(false)
    expect(result.current.editingId).toBeNull()
    expect(result.current.yearFilter).toBeNull()
    expect(result.current.newSelectedYears).toEqual([2025])
  })
})
