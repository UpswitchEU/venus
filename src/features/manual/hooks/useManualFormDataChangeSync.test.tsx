import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { buildSubmittedFinancialSnapshot } from '../utils/manualFinancialSnapshot'
import { useManualFormDataChangeSync } from './useManualFormDataChangeSync'

vi.mock('../../../store/manual', () => ({
  useManualFormStore: { getState: () => ({ formData: {} }) },
}))
vi.mock('../../../utils/storeReflectsBridgeMapped', () => ({
  storeReflectsBridgeMapped: () => true,
}))
vi.mock('../utils/manualFormMapper', () => ({ mapClarityFormToVenusStore: () => ({}) }))

it('keeps a financial edit pending across a later partial company update', () => {
  const row = { year: 2025, revenue: 1_000_000, ebitda: 100_000, cash: 10 }
  const snapshot = buildSubmittedFinancialSnapshot({ current_year_data: row })
  const setIsDirty = vi.fn()
  const { result } = renderHook(() =>
    useManualFormDataChangeSync({
      lastSubmittedFinancialSnapshotRef: { current: snapshot },
      latestFormDataRef: { current: { yearlyFinancials: snapshot.yearlyFinancials } },
      result: {},
      setIsDirty,
      updateFormData: vi.fn(),
    })
  )
  act(() =>
    result.current.handleFormDataChange({ yearlyFinancials: [{ ...row, year: '2025', cash: 20 }] })
  )
  expect(setIsDirty).toHaveBeenLastCalledWith(true)
  act(() => result.current.handleFormDataChange({ companyName: 'Updated company' }))
  expect(setIsDirty).toHaveBeenLastCalledWith(true)
  act(() => result.current.handleFormDataChange({ yearlyFinancials: snapshot.yearlyFinancials }))
  expect(setIsDirty).toHaveBeenLastCalledWith(false)
})
