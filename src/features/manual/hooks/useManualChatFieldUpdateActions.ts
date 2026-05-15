import { type Dispatch, type SetStateAction, useCallback } from 'react'
import { toast } from 'sonner'
import { trackAIFieldUpdate } from '@/lib/analytics'
import type { ChatMessage } from '../../../components/calculator'
import {
  buildManualChatFieldUpdateBridge,
  formatManualChatFieldUpdateValue,
} from '../utils/manualChatFieldUpdate'
import { buildManualSystemChatMessage } from '../utils/manualChatMessages'
import type { ManualPendingFieldUpdate } from '../utils/manualChatCommandHandling'

type ManualChatFieldUpdateTranslator = (
  key: string,
  values?: Record<string, string>
) => string
type UpdateManualFormData = (
  patch: ReturnType<typeof buildManualChatFieldUpdateBridge>['formPatch']
) => void

export interface UseManualChatFieldUpdateActionsParams<TCollectedData extends object> {
  currentLocale: string
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>
  setCollectedData: Dispatch<SetStateAction<TCollectedData>>
  setPendingUpdates: Dispatch<SetStateAction<ManualPendingFieldUpdate[]>>
  translate: ManualChatFieldUpdateTranslator
  updateFormData: UpdateManualFormData
}

export interface UseManualChatFieldUpdateActionsResult {
  handleApplyFieldUpdate: (field: string, value: unknown) => void
  handleAcceptUpdate: (field: string) => void
  handleRejectUpdate: (field: string) => void
}

export function useManualChatFieldUpdateActions<TCollectedData extends object>({
  currentLocale,
  setChatMessages,
  setCollectedData,
  setPendingUpdates,
  translate,
  updateFormData,
}: UseManualChatFieldUpdateActionsParams<TCollectedData>): UseManualChatFieldUpdateActionsResult {
  const handleApplyFieldUpdate = useCallback(
    (field: string, value: unknown) => {
      const bridge = buildManualChatFieldUpdateBridge(field, value)
      const collectedDataKey = bridge.collectedDataKey
      if (collectedDataKey) {
        setCollectedData(
          (prev) =>
            ({
              ...prev,
              [collectedDataKey]: value,
            }) as TCollectedData
        )
      }
      if (Object.keys(bridge.formPatch).length > 0) {
        updateFormData(bridge.formPatch)
      }
      toast.success(
        translate('fieldUpdated', {
          field,
          value: formatManualChatFieldUpdateValue(value, currentLocale),
        })
      )
      setChatMessages((prev) => [
        ...prev,
        buildManualSystemChatMessage({
          id: crypto.randomUUID(),
          content: translate('fieldApplied', { field }),
        }),
      ])
    },
    [currentLocale, setChatMessages, setCollectedData, translate, updateFormData]
  )

  const handleAcceptUpdate = useCallback(
    (field: string) => {
      trackAIFieldUpdate()
      setPendingUpdates((prev) => prev.filter((update) => update.field !== field))
    },
    [setPendingUpdates]
  )

  const handleRejectUpdate = useCallback(
    (field: string) => {
      setPendingUpdates((prev) => prev.filter((update) => update.field !== field))
      toast.info(translate('suggestionRejected'))
    },
    [setPendingUpdates, translate]
  )

  return {
    handleApplyFieldUpdate,
    handleAcceptUpdate,
    handleRejectUpdate,
  }
}
