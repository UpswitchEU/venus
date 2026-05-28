// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { resolveBusinessTypeLabel } from '../businessTypeDisplay'

describe('resolveBusinessTypeLabel', () => {
  it('prefers design-system name over API title', () => {
    expect(resolveBusinessTypeLabel({ id: 'logistics', name: 'Logistics', title: 'Legacy' })).toBe(
      'Logistics'
    )
  })

  it('falls back to title then id', () => {
    expect(resolveBusinessTypeLabel({ id: 'logistics', title: 'Logistics' })).toBe('Logistics')
    expect(resolveBusinessTypeLabel({ id: 'logistics' })).toBe('logistics')
  })

  it('uses fallback for empty labels', () => {
    expect(resolveBusinessTypeLabel({ id: '   ', name: '  ' }, 'Unknown')).toBe('Unknown')
    expect(resolveBusinessTypeLabel(null, 'Unknown')).toBe('Unknown')
  })
})
