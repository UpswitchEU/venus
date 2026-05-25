import { useCallback, useState } from 'react'
import { useAiConsent } from '@/hooks/useAiConsent'

interface UseChatAssistantConsentFlowOptions {
  locale: string
  onRetry?: (messageId: string) => void
}

export function useChatAssistantConsentFlow({
  locale,
  onRetry,
}: UseChatAssistantConsentFlowOptions) {
  const [consentModalOpen, setConsentModalOpen] = useState(false)
  const [consentRetryMessageId, setConsentRetryMessageId] = useState<string | null>(null)
  const [isGrantingConsent, setIsGrantingConsent] = useState(false)
  const {
    status: aiConsentStatus,
    error: aiConsentError,
    grant: grantAiConsent,
  } = useAiConsent({
    enabled: consentModalOpen,
  })

  const handleOpenConsent = useCallback((messageId: string) => {
    setConsentRetryMessageId(messageId)
    setConsentModalOpen(true)
  }, [])

  const handleGrantConsent = useCallback(async () => {
    setIsGrantingConsent(true)
    const ok = await grantAiConsent({ locale })
    setIsGrantingConsent(false)
    if (!ok) return

    const retryMessageId = consentRetryMessageId
    setConsentModalOpen(false)
    setConsentRetryMessageId(null)
    if (retryMessageId) {
      onRetry?.(retryMessageId)
    }
  }, [consentRetryMessageId, grantAiConsent, locale, onRetry])

  return {
    aiConsentError,
    aiConsentStatus,
    consentModalOpen,
    consentRetryMessageId,
    handleGrantConsent,
    handleOpenConsent,
    isGrantingConsent,
    setConsentModalOpen,
  }
}
