import { type Dispatch, type SetStateAction, useCallback } from 'react'
import type { FieldContext, FieldHelpContext } from '../../../components/calculator'
import { buildManualFieldContext, buildManualFieldHelpQuestion } from '../utils/manualFieldHelp'

type ManualChatMessageSender = (content: string) => void | Promise<void>

export interface UseManualFieldHelpActionsParams {
  currentLocale: string
  handleChatMessage: ManualChatMessageSender
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
        void handleChatMessage(buildManualFieldHelpQuestion(context, currentLocale))
      }, 300)
    },
    [currentLocale, handleChatMessage, setChatDrawerOpen, setFieldContext]
  )

  return { handleFieldHelpRequest }
}
