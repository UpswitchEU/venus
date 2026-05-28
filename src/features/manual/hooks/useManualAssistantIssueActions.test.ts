import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const scrollAnchorIntoManualLayout = vi.hoisted(() => vi.fn(() => true))
const scheduleAfterScrollLockRelease = vi.hoisted(() =>
  vi.fn((action: () => void) => {
    action()
  })
)

vi.mock('../utils/manualLayoutScroll', () => ({
  scrollAnchorIntoManualLayout,
  scheduleAfterScrollLockRelease,
}))

vi.mock('../utils/manualStartupAssistantSurface', () => ({
  getManualStartupIssueAnchor: () => 'startup-financials',
}))

vi.mock('@/lib/methods/startup_valuation/startupIssueQuickFix', () => ({
  applyStartupIssueQuickFix: vi.fn(() => true),
}))

vi.mock('@/store/manual/useStartupValuationStore', () => ({
  useStartupValuationStore: { getState: vi.fn(() => ({})) },
}))

import { useManualAssistantIssueActions } from './useManualAssistantIssueActions'

describe('useManualAssistantIssueActions', () => {
  it('closes the drawer before jumping to a startup issue', () => {
    const setChatDrawerOpen = vi.fn()
    const startupIssueById = new Map([['issue-1', { step: 'financials' as const }]])

    const { result } = renderHook(() =>
      useManualAssistantIssueActions({
        assistantLocale: 'nl',
        formatStartupAssistantPrompt: (prompt) => prompt,
        handleChatMessage: vi.fn(),
        setAcknowledgedQualityWarnings: vi.fn(),
        setAcknowledgedStartupIssues: vi.fn(),
        setChatDrawerOpen,
        startupIssueById,
      })
    )

    act(() => {
      result.current.handleJumpToStartupIssue('issue-1')
    })

    expect(setChatDrawerOpen).toHaveBeenCalledWith(false)
    expect(scheduleAfterScrollLockRelease).toHaveBeenCalledTimes(1)
    expect(scrollAnchorIntoManualLayout).toHaveBeenCalledWith('startup-financials', {
      behavior: 'smooth',
      block: 'start',
    })
  })
})
