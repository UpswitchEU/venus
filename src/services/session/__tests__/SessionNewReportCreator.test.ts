import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  recordBootstrapReportMode,
  resetBootstrapReportModeRegistryForTests,
} from '../../../lib/bootstrap/bootstrapReportModeRegistry'
import { backendAPI } from '../../backendApi'
import { createSessionForNewReportIfAllowed } from '../SessionNewReportCreator'
import { checkValuationCreationAllowed } from '../SessionPlanEnforcement'

vi.mock('../../backendApi', () => ({
  backendAPI: {
    createValuationSession: vi.fn(),
  },
}))

vi.mock('../SessionPlanEnforcement', () => ({
  checkValuationCreationAllowed: vi.fn(),
}))

describe('createSessionForNewReportIfAllowed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetBootstrapReportModeRegistryForTests()
  })

  it('does not create a draft when the calling scope changes during the plan check', async () => {
    recordBootstrapReportMode('val_new_report', 'new')
    let resolve!: () => void
    let active = true
    vi.mocked(checkValuationCreationAllowed).mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolve = res
        })
    )
    const pending = createSessionForNewReportIfAllowed(
      'val_new_report',
      'manual',
      null,
      () => active
    )
    await vi.waitFor(() => expect(checkValuationCreationAllowed).toHaveBeenCalledTimes(1))
    active = false
    resolve()
    expect(await pending).toBeNull()
    expect(backendAPI.createValuationSession).not.toHaveBeenCalled()
  })

  it('refuses to create fallback sessions for UUID reports without bootstrap proof', async () => {
    const result = await createSessionForNewReportIfAllowed(
      '46e05c0c-6f40-4527-82cb-4560d6eee0ad',
      'manual'
    )

    expect(result).toBeNull()
    expect(checkValuationCreationAllowed).not.toHaveBeenCalled()
    expect(backendAPI.createValuationSession).not.toHaveBeenCalled()
  })

  it('refuses to create fallback sessions when bootstrap resolved the report as existing', async () => {
    recordBootstrapReportMode('val_existing_report', 'existing')

    const result = await createSessionForNewReportIfAllowed('val_existing_report', 'manual')

    expect(result).toBeNull()
    expect(checkValuationCreationAllowed).not.toHaveBeenCalled()
    expect(backendAPI.createValuationSession).not.toHaveBeenCalled()
  })
})
