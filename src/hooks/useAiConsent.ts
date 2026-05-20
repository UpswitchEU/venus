'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface AiConsentStatus {
  active: boolean
  grantedAt: string | null
  consentId: string | null
  currentPolicyVersion: string
  hasHistoricConsent: boolean
}

export interface UseAiConsentOptions {
  enabled?: boolean
}

export interface UseAiConsentResult {
  status: AiConsentStatus | null
  isLoading: boolean
  error: string | null
  refreshStatus: () => Promise<void>
  grant: (input?: { locale?: string }) => Promise<boolean>
  revoke: () => Promise<boolean>
}

const ENDPOINT = '/api/profile/ai-consent'

function normalizeStatus(json: Partial<AiConsentStatus>): AiConsentStatus {
  return {
    active: Boolean(json.active),
    grantedAt: typeof json.grantedAt === 'string' ? json.grantedAt : null,
    consentId: typeof json.consentId === 'string' ? json.consentId : null,
    currentPolicyVersion:
      typeof json.currentPolicyVersion === 'string' ? json.currentPolicyVersion : '',
    hasHistoricConsent: Boolean(json.hasHistoricConsent),
  }
}

export function useAiConsent(options: UseAiConsentOptions = {}): UseAiConsentResult {
  const enabled = options.enabled ?? true
  const [status, setStatus] = useState<AiConsentStatus | null>(null)
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const refreshStatus = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(ENDPOINT, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
      })

      if (!res.ok) {
        setStatus(null)
        setError(`HTTP ${res.status}`)
        return
      }

      const json = (await res.json().catch(() => ({}))) as Partial<AiConsentStatus>
      setStatus(normalizeStatus(json))
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return
      setStatus(null)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      if (abortRef.current === controller) {
        setIsLoading(false)
        abortRef.current = null
      }
    }
  }, [])

  const grant = useCallback(
    async (input?: { locale?: string }): Promise<boolean> => {
      setError(null)
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope: 'chat', locale: input?.locale }),
        })

        if (!res.ok) {
          setError(`HTTP ${res.status}`)
          return false
        }

        const json = (await res.json().catch(() => ({}))) as Partial<AiConsentStatus>
        setStatus({
          ...normalizeStatus(json),
          active: true,
          grantedAt: typeof json.grantedAt === 'string' ? json.grantedAt : new Date().toISOString(),
          currentPolicyVersion:
            typeof json.currentPolicyVersion === 'string'
              ? json.currentPolicyVersion
              : (status?.currentPolicyVersion ?? ''),
          hasHistoricConsent: true,
        })
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        return false
      }
    },
    [status?.currentPolicyVersion]
  )

  const revoke = useCallback(async (): Promise<boolean> => {
    setError(null)
    try {
      const res = await fetch(ENDPOINT, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!res.ok) {
        setError(`HTTP ${res.status}`)
        return false
      }

      await refreshStatus()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return false
    }
  }, [refreshStatus])

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false)
      return
    }

    void refreshStatus()
    return () => {
      abortRef.current?.abort()
    }
  }, [enabled, refreshStatus])

  return { status, isLoading, error, refreshStatus, grant, revoke }
}
