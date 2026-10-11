// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { ValuationFormData } from '@/types/valuation'
import { buildManualChatInputPatch } from './manualChatInputPatch'
import { mapClarityFormToVenusStore } from './manualFormMapper'

const form = {
  yearlyFinancials: [
    { year: '2024', revenue: 800000, ebitda: 100000 },
    { year: '2025', revenue: 1000000, ebitda: 150000 },
    { year: '2026', revenue: 2000000, ebitda: 200000, isForecast: true },
  ],
}
describe('approved assistant financial changes', () => {
  it('updates the requested historical year and the canonical submission data', () => {
    const patch = buildManualChatInputPatch(form, 'revenue.2025', 2500000)
    if (!patch) throw new Error('Expected a valid financial patch')
    expect(patch.yearlyFinancials?.[0].revenue).toBe(800000)
    expect(patch.yearlyFinancials?.[1].revenue).toBe(2500000)
    expect(patch.yearlyFinancials?.[2].revenue).toBe(2000000)
    const canonical = mapClarityFormToVenusStore({ ...form, ...patch }, {} as ValuationFormData)
    expect(canonical.current_year_data?.revenue).toBe(2500000)
  })
  it('uses the latest historical row and permits losses', () => {
    const patch = buildManualChatInputPatch(form, 'ebitda', -10000)
    expect(patch?.yearlyFinancials?.[1].ebitda).toBe(-10000)
    expect(patch?.yearlyFinancials?.[2].ebitda).toBe(200000)
  })
  it.each([
    ['revenue.2023', 100],
    ['revenue', -1],
    ['revenue', '2.5m'],
    ['unknown', 100],
    ['foundingYear', '2020oops'],
  ])('rejects unsupported or ambiguous change %s=%s', (field, value) => {
    expect(buildManualChatInputPatch(form, String(field), value)).toBeNull()
  })
  it('maps advertised identity, staffing and SDE aliases into the panel and store', () => {
    expect(buildManualChatInputPatch(form, 'employees', 12)).toMatchObject({
      fteEmployees: 12,
      number_of_employees: 12,
    })
    expect(buildManualChatInputPatch(form, 'foundingYear', 2010)).toMatchObject({
      yearFounded: '2010',
      founding_year: 2010,
    })
    expect(buildManualChatInputPatch(form, 'number_of_owners', 2)).toMatchObject({
      ownerManagers: 2,
      number_of_owners: 2,
    })
    expect(buildManualChatInputPatch(form, 'ownerSalary', 60000)).toMatchObject({
      ownerSalary: 60000,
      owner_salary_addback: 60000,
    })
  })
})
