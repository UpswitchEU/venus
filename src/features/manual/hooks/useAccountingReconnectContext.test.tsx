import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ACCOUNTING_RECONNECT_STATUS_EVENT,
  persistAccountingReconnectIntent,
} from '../utils/accountingReconnectResume'
import { useAccountingReconnectContext } from './useAccountingReconnectContext'

describe('reconnect context ownership', () => {
  beforeEach(() => {
    sessionStorage.clear()
    persistAccountingReconnectIntent(sessionStorage, {
      clientId: 'client-1',
      reportId: 'report-1',
      provider: 'silverfin',
      formData: {
        companyName: 'Company',
        businessType: 'services',
        industry: 'services',
        country: 'BE',
        yearFounded: '2020',
        businessStructure: 'company',
        ownerManagers: 1,
        fteEmployees: 5,
        yearlyFinancials: [],
      },
    })
  })
  it('drops recovery immediately when switching report or client', () => {
    const { result, rerender } = renderHook(
      ({ report, client }) => useAccountingReconnectContext(report, client),
      { initialProps: { report: 'report-1', client: 'client-1' } }
    )
    expect(result.current.accountingReconnectContext?.provider).toBe('silverfin')
    rerender({ report: 'report-2', client: 'client-1' })
    expect(result.current.accountingReconnectContext).toBeNull()
    rerender({ report: 'report-1', client: 'client-2' })
    expect(result.current.accountingReconnectContext).toBeNull()
  })
  it('uses persisted state and ignores contradictory event details', () => {
    const { result } = renderHook(() => useAccountingReconnectContext('report-1', 'client-1'))
    act(() =>
      window.dispatchEvent(
        new CustomEvent(ACCOUNTING_RECONNECT_STATUS_EVENT, {
          detail: { provider: 'other', clientId: 'client-2', phase: 'ready' },
        })
      )
    )
    expect(result.current.accountingReconnectContext).toMatchObject({
      provider: 'silverfin',
      client_id: 'client-1',
      recovery_phase: 'reconnect_required',
    })
    act(() => result.current.handleAccountingReconnectRecovered())
    expect(result.current.accountingReconnectContext).toBeNull()
  })
})
