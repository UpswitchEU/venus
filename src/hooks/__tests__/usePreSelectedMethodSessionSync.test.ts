import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SESSION_PRE_SELECTED_METHODS_KEY,
  SESSION_PRE_SELECTED_VALUATION_METHOD_KEY,
  SESSION_USER_WEIGHT_JUSTIFICATION_KEY,
  SESSION_USER_WEIGHTS_KEY,
} from '../../constants/sessionUiKeys'
import { useManualResultsStore } from '../../store/manual/useManualResultsStore'
import { useSessionStore } from '../../store/useSessionStore'
import { usePreSelectedMethodSessionSync } from '../usePreSelectedMethodSessionSync'

const saveSession = vi.fn().mockResolvedValue(undefined)
const updateSessionData = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  vi.useFakeTimers()
  saveSession.mockClear()
  updateSessionData.mockClear()

  useSessionStore.setState({
    restorationComplete: true,
    session: {
      reportId: 'report-1',
      sessionData: {
        [SESSION_PRE_SELECTED_VALUATION_METHOD_KEY]: 'dcf',
        [SESSION_PRE_SELECTED_METHODS_KEY]: ['dcf'],
        [SESSION_USER_WEIGHTS_KEY]: null,
        [SESSION_USER_WEIGHT_JUSTIFICATION_KEY]: '',
      },
    },
    updateSessionData,
    saveSession,
  } as Parameters<typeof useSessionStore.setState>[0])

  useManualResultsStore.setState({
    preSelectedMethod: null,
    selectedMethod: 'dcf',
    preSelectedMethods: ['dcf'],
    userWeights: {},
    userWeightJustification: '',
  } as Parameters<typeof useManualResultsStore.setState>[0])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('usePreSelectedMethodSessionSync', () => {
  it('does not PATCH when restored session already matches the manual store snapshot', () => {
    renderHook(() =>
      usePreSelectedMethodSessionSync({
        reportId: 'report-1',
        resolvedReportId: 'report-1',
        restorationComplete: true,
        initialSelectedMethodFromUrl: undefined,
        firmCountryCode: 'BE',
        hasValuationResult: true,
      })
    )

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(updateSessionData).not.toHaveBeenCalled()
    expect(saveSession).not.toHaveBeenCalled()
  })

  it('PATCHes when the user changes pre-selected methods after restoration', async () => {
    const { rerender } = renderHook(
      (props: Parameters<typeof usePreSelectedMethodSessionSync>[0]) =>
        usePreSelectedMethodSessionSync(props),
      {
        initialProps: {
          reportId: 'report-1',
          resolvedReportId: 'report-1',
          restorationComplete: true,
          initialSelectedMethodFromUrl: undefined,
          firmCountryCode: 'BE',
          hasValuationResult: true,
        },
      }
    )

    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(saveSession).not.toHaveBeenCalled()

    act(() => {
      useManualResultsStore.setState({
        preSelectedMethods: ['dcf', 'ebitda'],
      } as Parameters<typeof useManualResultsStore.setState>[0])
    })

    rerender({
      reportId: 'report-1',
      resolvedReportId: 'report-1',
      restorationComplete: true,
      initialSelectedMethodFromUrl: undefined,
      firmCountryCode: 'BE',
      hasValuationResult: true,
    })

    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(updateSessionData).toHaveBeenCalledTimes(1)
    expect(saveSession).toHaveBeenCalledWith('autosave')
  })
})
