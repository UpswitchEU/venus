import { afterEach, describe, expect, it } from 'vitest'
import type { ValuationResponse, ValuationSession } from '../../../types/valuation'
import { useSessionStore } from '../../useSessionStore'
import { useManualResultsStore } from '../useManualResultsStore'

describe('restored results and session save state', () => {
  const initialSession = useSessionStore.getState()
  const initialResults = useManualResultsStore.getState()
  afterEach(() => {
    useSessionStore.setState(initialSession, true)
    useManualResultsStore.setState(initialResults, true)
  })

  it.each([false, true])('preserves pending edits = %s when hydrating a saved result', (dirty) => {
    useSessionStore.setState({
      engine: null,
      session: {
        reportId: 'saved-report',
        currentView: 'manual',
        sessionData: { company_name: 'Saved company' },
      } as ValuationSession,
      hasUnsavedChanges: dirty,
      dirtyVersion: 3,
      saveErrorMessage: dirty ? 'Previous save failed' : null,
    })
    const result = {
      valuation_id: 'saved-report',
      html_report: '<html><body><h1>Saved valuation</h1></body></html>',
    } as ValuationResponse

    useManualResultsStore.getState().setResult(result)

    expect(useSessionStore.getState()).toMatchObject({
      hasUnsavedChanges: dirty,
      dirtyVersion: 3,
      saveErrorMessage: dirty ? 'Previous save failed' : null,
      session: { valuationResult: result, htmlReport: result.html_report },
    })
  })
})
