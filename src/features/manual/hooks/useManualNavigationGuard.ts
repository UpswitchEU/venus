import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useId, useRef } from 'react'
import { toast } from 'sonner'
import { useSessionStore } from '../../../store/useSessionStore'
import { watchReportAccessScope } from '../../../utils/reportAccessScope'
import { isSameReportIdentity } from '../../../utils/reportIdentityPromotion'
import { installWorkspaceHistory } from '../../../utils/workspaceHistory'
import {
  saveManualWorkspaceBeforeNavigation,
  WorkspaceSaveNotReadyError,
} from '../utils/saveManualWorkspaceBeforeNavigation'

/** One guarded boundary for workspace exits, report switches and new valuations. */
export function useManualNavigationGuard({
  flushForm,
  isBusy,
}: {
  flushForm: () => Promise<void>
  isBusy: () => boolean
}) {
  const t = useTranslations('navigationSave')
  const toastId = useId()
  const latest = useRef({ flushForm, isBusy })
  latest.current = { flushForm, isBusy }
  const mounted = useRef(true)
  const activeAttempt = useRef<symbol | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      activeAttempt.current = null
      toast.dismiss(toastId)
    }
  }, [toastId])

  const navigateAfterSave = useCallback(
    async function navigateAfterSave(navigate: () => void | Promise<void>): Promise<void> {
      if (activeAttempt.current || !mounted.current) return
      const attempt = Symbol('navigation-save')
      activeAttempt.current = attempt
      const access = watchReportAccessScope()
      const target = useSessionStore.getState()
      const matchesTarget = () => {
        const current = useSessionStore.getState()
        return (
          mounted.current &&
          access.isCurrent() &&
          current.engine === target.engine &&
          current.engineRevision === target.engineRevision &&
          (current.session?.reportId === target.session?.reportId ||
            isSameReportIdentity(current.session?.reportId, target.session?.reportId))
        )
      }
      const isCurrent = () => matchesTarget() && activeAttempt.current === attempt
      let saved = false
      let timeout: ReturnType<typeof setTimeout> | undefined
      // Keep the screen usable even when the network never settles. The original
      // save may still finish, but an expired attempt cannot navigate afterward.
      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Save confirmation timed out')), 15000)
      })
      // Already-saved reports can leave without flashing a loading toast.
      const notice = setTimeout(() => {
        if (isCurrent()) toast.loading(t('saving'), { id: toastId })
      }, 200)
      try {
        await Promise.race([
          saveManualWorkspaceBeforeNavigation({
            flushForm: () => latest.current.flushForm(),
            isBusy: () => latest.current.isBusy(),
            isCurrent,
          }),
          deadline,
        ])
        if (!isCurrent()) return
        saved = true
        toast.dismiss(toastId)
        await navigate()
      } catch (error) {
        if (!isCurrent()) return
        toast.error(
          saved
            ? t('navigationFailed')
            : error instanceof WorkspaceSaveNotReadyError
              ? t('busy')
              : t('failed'),
          {
            id: toastId,
            duration: Infinity,
            description: t('keptOpen'),
            action: {
              label: t('retry'),
              onClick: () => {
                if (matchesTarget()) void navigateAfterSave(navigate)
                else toast.dismiss(toastId)
              },
            },
          }
        )
      } finally {
        clearTimeout(notice)
        if (timeout) clearTimeout(timeout)
        access.dispose()
        if (!matchesTarget()) toast.dismiss(toastId)
        if (activeAttempt.current === attempt) activeAttempt.current = null
      }
    },
    [t, toastId]
  )

  useEffect(() => installWorkspaceHistory()?.register(navigateAfterSave), [navigateAfterSave])
  return navigateAfterSave
}
