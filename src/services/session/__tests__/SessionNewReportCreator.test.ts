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
