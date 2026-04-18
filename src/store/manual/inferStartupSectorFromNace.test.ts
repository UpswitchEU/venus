import { describe, expect, it } from 'vitest'
import { inferStartupSectorFromNace } from './inferStartupSectorFromNace'

describe('inferStartupSectorFromNace', () => {
  it('maps computer programming (62.x) to saas', () => {
    expect(inferStartupSectorFromNace('62.01')).toBe('saas')
    expect(inferStartupSectorFromNace('62.02')).toBe('saas')
  })

  it('maps publishing of software (58.x) to saas', () => {
    expect(inferStartupSectorFromNace('58.29')).toBe('saas')
  })

  it('maps data / web portals (63.x) to saas', () => {
    expect(inferStartupSectorFromNace('63.11')).toBe('saas')
  })

  it.each(['64.19', '65.20', '66.12'])(
    'maps financial activities %s to fintech',
    (code) => {
      expect(inferStartupSectorFromNace(code)).toBe('fintech')
    }
  )

  it('maps scientific R&D (72.x) to deeptech_ai', () => {
    expect(inferStartupSectorFromNace('72.11')).toBe('deeptech_ai')
  })

  it.each(['86.10', '87.30', '88.91'])(
    'maps human-health activities %s to biotech_healthtech',
    (code) => {
      expect(inferStartupSectorFromNace(code)).toBe('biotech_healthtech')
    }
  )

  it('maps pharmaceutical preparations (21.x) to biotech_healthtech', () => {
    expect(inferStartupSectorFromNace('21.20')).toBe('biotech_healthtech')
  })

  it.each(['26.20', '27.40', '28.99', '29.10', '30.30'])(
    'maps manufacturing %s to hardware',
    (code) => {
      expect(inferStartupSectorFromNace(code)).toBe('hardware')
    }
  )

  it.each(['49.39', '52.29', '53.20'])(
    'maps transportation / logistics %s to marketplace',
    (code) => {
      expect(inferStartupSectorFromNace(code)).toBe('marketplace')
    }
  )

  it('maps retail (47.x) to consumer', () => {
    expect(inferStartupSectorFromNace('47.91')).toBe('consumer')
  })

  it('returns null for ambiguous / unmapped divisions', () => {
    // Construction, agriculture, food production, accommodation —
    // intentionally unmapped so we leave the founder's default alone.
    expect(inferStartupSectorFromNace('41.20')).toBeNull()
    expect(inferStartupSectorFromNace('01.11')).toBeNull()
    expect(inferStartupSectorFromNace('10.71')).toBeNull()
    expect(inferStartupSectorFromNace('55.10')).toBeNull()
  })

  it('handles dotless and prefixed NACE strings', () => {
    expect(inferStartupSectorFromNace('6201')).toBe('saas')
    expect(inferStartupSectorFromNace('NACE-62.01')).toBe('saas')
    expect(inferStartupSectorFromNace(' 62.01 ')).toBe('saas')
  })

  it('returns null for blank / null / non-string inputs', () => {
    expect(inferStartupSectorFromNace(null)).toBeNull()
    expect(inferStartupSectorFromNace(undefined)).toBeNull()
    expect(inferStartupSectorFromNace('')).toBeNull()
    expect(inferStartupSectorFromNace('abc')).toBeNull()
  })
})
