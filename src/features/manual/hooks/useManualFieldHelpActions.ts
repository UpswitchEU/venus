import { type Dispatch, type SetStateAction, useCallback } from 'react'
import type { FieldContext, FieldHelpContext } from '../../../components/calculator'
import type { AssistantIntent } from '@/services/ai/local-chat-fallback'
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
  const handleFieldHelpRequest = useCallback(
    (context: FieldHelpContext) => {
      setFieldContext(buildManualFieldContext(context))
      setChatDrawerOpen(true)

      setTimeout(() => {
        const question = buildManualFieldHelpQuestion(context, currentLocale)
        const assistantIntent: AssistantIntent | undefined =
          context.field === 'ebitda' ? 'explain_ebitda' : undefined
        void handleChatMessage(question, undefined, undefined, undefined, assistantIntent)
      }, 300)
    },
    [currentLocale, handleChatMessage, setChatDrawerOpen, setFieldContext]
  )

  return { handleFieldHelpRequest }
}
