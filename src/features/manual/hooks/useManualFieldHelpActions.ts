import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef } from 'react'
import type { AssistantIntent } from '@/services/ai/local-chat-fallback'
import type { FieldContext, FieldHelpContext } from '../../../components/calculator'
import { buildManualFieldContext, buildManualFieldHelpQuestion } from '../utils/manualFieldHelp'

import type { ManualChatSendHandler } from './useManualChatMessageActions'

export interface UseManualFieldHelpActionsParams {
  currentLocale: string
  handleChatMessage: ManualChatSendHandler
  setChatDrawerOpen: Dispatch<SetStateAction<boolean>>
  setFieldContext: Dispatch<SetStateAction<FieldContext | undefined>>
}

export interface UseManualFieldHelpActionsResult {
  handleFieldHelpRequest: (context: FieldHelpContext) => void
}

export function useManualFieldHelpActions({
  currentLocale,
  handleChatMessage,
  setChatDrawerOpen,
  setFieldContext,
}: UseManualFieldHelpActionsParams): UseManualFieldHelpActionsResult {
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPendingSend = useCallback(() => {
    if (!sendTimerRef.current) return
    clearTimeout(sendTimerRef.current)
    sendTimerRef.current = null
  }, [])

  useEffect(() => clearPendingSend, [clearPendingSend])

  const handleFieldHelpRequest = useCallback(
    (context: FieldHelpContext) => {
      clearPendingSend()
      setFieldContext(buildManualFieldContext(context))
      setChatDrawerOpen(true)

      sendTimerRef.current = setTimeout(() => {
        sendTimerRef.current = null
        const question = buildManualFieldHelpQuestion(context, currentLocale)
        const assistantIntent: AssistantIntent | undefined =
          context.field === 'ebitda' ? 'explain_ebitda' : undefined
        void handleChatMessage(question, undefined, undefined, undefined, assistantIntent)
      }, 300)
    },
    [clearPendingSend, currentLocale, handleChatMessage, setChatDrawerOpen, setFieldContext]
  )

  return { handleFieldHelpRequest }
}
