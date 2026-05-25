import { describe, expect, it } from 'vitest'
import type { BusinessType } from '@/services/businessTypesApi'
import { resolveBusinessTypeIdForSector } from './PresetPicker'

describe('resolveBusinessTypeIdForSector', () => {
  it('matches category fallback when business type category is object-shaped', () => {
    const catalogue = [
      {
        id: 'fintech-db-type',
        category: { id: 'finance', name: 'Financieel' },
        keywords: [],
      },
    ] as unknown as BusinessType[]

    expect(resolveBusinessTypeIdForSector('fintech', catalogue)).toBe('fintech-db-type')
  })
})
