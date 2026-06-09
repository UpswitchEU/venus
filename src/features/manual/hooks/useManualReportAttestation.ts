import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { resolveAttestationErrorDescription } from '@/utils/attestation-errors'

export interface AttestationReadiness {
  /** Set false when the readiness probe fails. */
  enabled?: boolean
  /** Titan `getAttestEnvironmentCapabilities().attestEnabled`. */
  attestEnabled?: boolean
  mode?: string
  productionSigningReady?: boolean
  blockers?: string[]
  message?: string
}

export function isAttestationMenuVisible(
  readiness: AttestationReadiness | null,
  enabled: boolean,
  reportId: string | null | undefined
): boolean {
  if (!enabled || !reportId) return false
  if (!readiness) return false
  if (readiness.enabled === false) return false
  return readiness.attestEnabled === true
}

export interface AttestationCreateResult {
  id: string
  verify_url?: string
  status?: string
}

interface UseManualReportAttestationParams {
  reportId: string | null | undefined
  enabled: boolean
  collaborationId?: string | null
  subjectUserId?: string | null
  startedTitle: string
  successTitle: string
  successDescription?: string
  failedTitle: string
  notFinalizedDescription?: string
}

export function useManualReportAttestation({
  reportId,
  enabled,
  collaborationId,
  subjectUserId,
  startedTitle,
  successTitle,
  successDescription,
  failedTitle,
  notFinalizedDescription,
}: UseManualReportAttestationParams) {
  const [readiness, setReadiness] = useState<AttestationReadiness | null>(null)
  const [isAttesting, setIsAttesting] = useState(false)
  const isAttestingRef = useRef(false)

  useEffect(() => {
    if (!enabled) {
      setReadiness(null)
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/attestations/readiness', { credentials: 'include' })
        const json = (await res.json().catch(() => ({}))) as AttestationReadiness
        if (!cancelled) {
          setReadiness(res.ok ? json : { ...json, enabled: false })
        }
      } catch {
        if (!cancelled) setReadiness({ enabled: false })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled])

  const handleSignAttest = useCallback(async () => {
    if (!reportId || isAttestingRef.current) return

    isAttestingRef.current = true
    setIsAttesting(true)
    toast.info(startedTitle)
    try {
      const res = await fetch('/api/attestations', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: reportId,
          ...(collaborationId ? { collaboration_id: collaborationId } : {}),
          ...(subjectUserId ? { subject_user_id: subjectUserId } : {}),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean
        message?: string
        data?: AttestationCreateResult
      }
      if (!res.ok || json.success === false) {
        throw new Error(json.message || failedTitle)
      }
      toast.success(successTitle, successDescription ? { description: successDescription } : undefined)
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : undefined
      toast.error(failedTitle, {
        description: resolveAttestationErrorDescription(
          rawMessage,
          notFinalizedDescription ?? rawMessage ?? failedTitle
        ),
      })
    } finally {
      isAttestingRef.current = false
      setIsAttesting(false)
    }
  }, [
    collaborationId,
    failedTitle,
    notFinalizedDescription,
    reportId,
    startedTitle,
    subjectUserId,
    successDescription,
    successTitle,
  ])

  const canSignAttest = isAttestationMenuVisible(readiness, enabled, reportId)

  return { readiness, isAttesting, canSignAttest, handleSignAttest }
}
