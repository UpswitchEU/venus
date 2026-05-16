import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MANUAL_AGENT_NEXT_PROFILE_BUYERS_PROMPT,
  MANUAL_AGENT_NEXT_RUN_VALUATION_PROMPT,
} from '../utils/manualAgentNextHandoff'
import {
  type UseManualAgentPromptHandoffParams,
  useManualAgentPromptHandoff,
} from './useManualAgentPromptHandoff'

function makeParams(
  overrides: Partial<UseManualAgentPromptHandoffParams> = {}
): UseManualAgentPromptHandoffParams {
  return {
    chatDrawerOpen: true,
    handleChatMessage: vi.fn(),
    initialAgentNext: 'run_valuation',
    isChatGenerating: false,
    isLoadingHistory: false,
    lastLoadedReportId: 'val_1',
    manualChatReportId: 'val_1',
    pendingPostValuationAgentPrompt: null,
    setChatDrawerOpen: vi.fn(),
    setPendingPostValuationAgentPrompt: vi.fn(),
    ...overrides,
  }
}

describe('useManualAgentPromptHandoff', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('sends the URL handoff once per report and prompt scope', async () => {
    const handleChatMessage = vi.fn()
    const setChatDrawerOpen = vi.fn()

    window.history.pushState(
      {},
      '',
      '/en/reports/val_1?source=mercury&agent_next=run_valuation&drawer=open'
    )

    const { rerender } = renderHook(
      (props: UseManualAgentPromptHandoffParams) => useManualAgentPromptHandoff(props),
      {
        initialProps: makeParams({
          handleChatMessage,
          setChatDrawerOpen,
        }),
      }
    )

    await waitFor(() => expect(handleChatMessage).toHaveBeenCalledTimes(1))
    expect(handleChatMessage).toHaveBeenLastCalledWith(MANUAL_AGENT_NEXT_RUN_VALUATION_PROMPT)
    expect(window.location.search).toBe('?source=mercury&drawer=open')

    rerender(
      makeParams({
        handleChatMessage,
        setChatDrawerOpen,
      })
    )
    expect(handleChatMessage).toHaveBeenCalledTimes(1)

    window.history.pushState(
      {},
      '',
      '/en/reports/val_2?source=mercury&agent_next=profile_buyers&drawer=open'
    )

    rerender(
      makeParams({
        handleChatMessage,
        initialAgentNext: 'profile_buyers',
        lastLoadedReportId: 'val_2',
        manualChatReportId: 'val_2',
        setChatDrawerOpen,
      })
    )

    await waitFor(() => expect(handleChatMessage).toHaveBeenCalledTimes(2))
    expect(handleChatMessage).toHaveBeenLastCalledWith(MANUAL_AGENT_NEXT_PROFILE_BUYERS_PROMPT)
    expect(window.location.search).toBe('?source=mercury&drawer=open')
  })

  it('opens the assistant drawer before consuming the handoff', async () => {
    const handleChatMessage = vi.fn()
    const setChatDrawerOpen = vi.fn()

    window.history.pushState(
      {},
      '',
      '/en/reports/val_1?source=mercury&agent_next=run_valuation&drawer=closed'
    )

    const { rerender } = renderHook(
      (props: UseManualAgentPromptHandoffParams) => useManualAgentPromptHandoff(props),
      {
        initialProps: makeParams({
          chatDrawerOpen: false,
          handleChatMessage,
          setChatDrawerOpen,
        }),
      }
    )

    expect(setChatDrawerOpen).toHaveBeenCalledWith(true)
    expect(handleChatMessage).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?source=mercury&agent_next=run_valuation&drawer=closed')

    rerender(
      makeParams({
        handleChatMessage,
        setChatDrawerOpen,
      })
    )

    await waitFor(() => expect(handleChatMessage).toHaveBeenCalledTimes(1))
    expect(handleChatMessage).toHaveBeenLastCalledWith(MANUAL_AGENT_NEXT_RUN_VALUATION_PROMPT)
    expect(window.location.search).toBe('?source=mercury&drawer=closed')
  })
})
