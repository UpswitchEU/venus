import { type Dispatch, type SetStateAction, useCallback } from 'react'
import type { StudioIssue } from '@/features/startup-studio/hooks/useStudioIssues'
import { applyStartupIssueQuickFix } from '@/lib/methods/startup_valuation/startupIssueQuickFix'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import {
  scheduleAfterScrollLockRelease,
  scrollAnchorIntoManualLayout,
} from '../utils/manualLayoutScroll'
import { getManualStartupIssueAnchor } from '../utils/manualStartupAssistantSurface'
import type { ManualChatSendHandler } from './useManualChatMessageActions'

type AcknowledgementSetter = Dispatch<SetStateAction<Set<string>>>

type StartupIssueAnchor = Pick<StudioIssue, 'step'>

export interface UseManualAssistantIssueActionsParams {
  assistantLocale: 'en' | 'nl' | 'fr'
  formatStartupAssistantPrompt: (prompt: string) => string
  handleChatMessage: ManualChatSendHandler
  setAcknowledgedQualityWarnings: AcknowledgementSetter
  setAcknowledgedStartupIssues: AcknowledgementSetter
  setChatDrawerOpen: Dispatch<SetStateAction<boolean>>
  startupIssueById: ReadonlyMap<string, StartupIssueAnchor>
}

export interface UseManualAssistantIssueActionsResult {
  handleResolveStartupLauncherIssue: (issue: StudioIssue) => void
  handleResolveQualityWarning: (warningType: string, prompt: string) => void
  handleDismissQualityWarning: (warningType: string) => void
  handleResolveStartupIssue: (issueId: string, prompt: string) => void
  handleApplyStartupIssueQuickFix: (issueId: string) => void
  handleDismissStartupIssue: (issueId: string) => void
  handleJumpToStartupIssue: (issueId: string) => void
  handleJumpToQualityWarning: (anchor: string) => void
}

function acknowledge(setter: AcknowledgementSetter, id: string) {
  setter((prev) => {
    const next = new Set(prev)
    next.add(id)
    return next
  })
}

function jumpToIssue(startupIssueById: ReadonlyMap<string, StartupIssueAnchor>, issueId: string) {
  const issue = startupIssueById.get(issueId)
  if (!issue || typeof window === 'undefined') return
  const anchor = getManualStartupIssueAnchor(issue.step)
  if (!anchor) return
  scrollAnchorIntoManualLayout(anchor, { behavior: 'smooth', block: 'start' })
}

export function useManualAssistantIssueActions({
  assistantLocale,
  formatStartupAssistantPrompt,
  handleChatMessage,
  setAcknowledgedQualityWarnings,
  setAcknowledgedStartupIssues,
  setChatDrawerOpen,
  startupIssueById,
}: UseManualAssistantIssueActionsParams): UseManualAssistantIssueActionsResult {
  const handleResolveStartupLauncherIssue = useCallback(
    (issue: StudioIssue) => {
      setChatDrawerOpen(true)
      handleChatMessage(formatStartupAssistantPrompt(issue.assistantPrompt[assistantLocale]))
      acknowledge(setAcknowledgedStartupIssues, issue.id)
    },
    [
      assistantLocale,
      formatStartupAssistantPrompt,
      handleChatMessage,
      setAcknowledgedStartupIssues,
      setChatDrawerOpen,
    ]
  )

  const handleResolveQualityWarning = useCallback(
    (warningType: string, prompt: string) => {
      setChatDrawerOpen(true)
      handleChatMessage(prompt)
      acknowledge(setAcknowledgedQualityWarnings, warningType)
    },
    [handleChatMessage, setAcknowledgedQualityWarnings, setChatDrawerOpen]
  )

  const handleDismissQualityWarning = useCallback(
    (warningType: string) => {
      acknowledge(setAcknowledgedQualityWarnings, warningType)
    },
    [setAcknowledgedQualityWarnings]
  )

  const handleResolveStartupIssue = useCallback(
    (issueId: string, prompt: string) => {
      setChatDrawerOpen(true)
      handleChatMessage(prompt)
      acknowledge(setAcknowledgedStartupIssues, issueId)
    },
    [handleChatMessage, setAcknowledgedStartupIssues, setChatDrawerOpen]
  )

  const handleDismissStartupIssue = useCallback(
    (issueId: string) => {
      acknowledge(setAcknowledgedStartupIssues, issueId)
    },
    [setAcknowledgedStartupIssues]
  )

  const handleApplyStartupIssueQuickFix = useCallback(
    (issueId: string) => {
      const applied = applyStartupIssueQuickFix(issueId, useStartupValuationStore.getState())
      if (!applied) return
      acknowledge(setAcknowledgedStartupIssues, issueId)
      setChatDrawerOpen(false)
      scheduleAfterScrollLockRelease(() => jumpToIssue(startupIssueById, issueId))
    },
    [setAcknowledgedStartupIssues, setChatDrawerOpen, startupIssueById]
  )

  const handleJumpToStartupIssue = useCallback(
    (issueId: string) => {
      setChatDrawerOpen(false)
      scheduleAfterScrollLockRelease(() => jumpToIssue(startupIssueById, issueId))
    },
    [setChatDrawerOpen, startupIssueById]
  )

  // Jump-to-control for a quality warning: close the drawer and scroll the
  // advisor to the form control that fixes it (e.g. the sector or method
  // picker). No-op if the anchor isn't on screen.
  const handleJumpToQualityWarning = useCallback(
    (anchor: string) => {
      setChatDrawerOpen(false)
      scheduleAfterScrollLockRelease(() =>
        scrollAnchorIntoManualLayout(anchor, { behavior: 'smooth', block: 'start' })
      )
    },
    [setChatDrawerOpen]
  )

  return {
    handleResolveStartupLauncherIssue,
    handleResolveQualityWarning,
    handleDismissQualityWarning,
    handleResolveStartupIssue,
    handleApplyStartupIssueQuickFix,
    handleDismissStartupIssue,
    handleJumpToStartupIssue,
    handleJumpToQualityWarning,
  }
}
