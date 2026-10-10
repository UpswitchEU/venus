import { useLocale, useTranslations } from 'next-intl'
import { AuroraButton } from '../../../design-system/components/Button'
import { getMercuryUrl } from '../../../utils/getMercuryUrl'
import type { useReportRecovery } from '../hooks/useReportRecovery'

export function ManualReportRecoveryStatus({
  recovery,
  hasReport,
  pdfStale,
  pdfFailed,
  pdfRetrying,
  retryPdf,
  downloadPdf,
  isExporting = false,
  calculationStale = false,
  updateValuationFormId,
}: {
  recovery: ReturnType<typeof useReportRecovery>
  hasReport: boolean
  pdfStale: boolean
  pdfFailed: boolean
  pdfRetrying: boolean
  retryPdf: () => Promise<void>
  downloadPdf?: () => Promise<void>
  isExporting?: boolean
  calculationStale?: boolean
  updateValuationFormId?: string
}) {
  const t = useTranslations('reportRecovery')
  const locale = useLocale()
  const { failure, saving, blocked, scheduled, retry } = recovery
  if (!hasReport && !blocked) return null
  const subscription = failure?.kind === 'subscription'
  const accessDenied = failure?.kind === 'access'
  const message = saving
    ? 'saving'
    : subscription
      ? 'subscription'
      : accessDenied
        ? 'access'
        : failure
          ? 'saveFailed'
          : blocked
            ? 'saving'
            : calculationStale
              ? 'calculationStale'
              : pdfStale
                ? pdfFailed
                  ? 'pdfFailed'
                  : 'preparing'
                : 'saved'
  return (
    <div
      role="status"
      aria-live="polite"
      className="shrink-0 border-b border-foreground/10 bg-foreground/[0.03] px-4 py-3 flex flex-wrap items-center gap-3"
    >
      <div className="flex-1 text-sm">
        <p>{t(message)}</p>
        {scheduled && !saving && (
          <p className="text-xs text-foreground/60 mt-1">{t('automaticRetry')}</p>
        )}
      </div>
      {!saving &&
        subscription &&
        (failure.canManageBilling === true ? (
          <a
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
            href={`${getMercuryUrl()}/${locale}/advisor/settings?tab=billing`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('manageSubscription')}
          </a>
        ) : (
          <span className="text-sm">{t('askOwner')}</span>
        ))}
      {!saving && failure && !subscription && !accessDenied && (
        <AuroraButton size="sm" onClick={() => void retry()}>
          {t('retrySave')}
        </AuroraButton>
      )}
      {!blocked && calculationStale && updateValuationFormId && (
        <AuroraButton size="sm" type="submit" form={updateValuationFormId}>
          {t('updateValuation')}
        </AuroraButton>
      )}
      {!blocked && !calculationStale && !pdfStale && hasReport && downloadPdf && (
        <AuroraButton
          size="sm"
          loading={isExporting}
          disabled={isExporting}
          onClick={() => void downloadPdf()}
        >
          {t('downloadPdf')}
        </AuroraButton>
      )}
      {!blocked && !calculationStale && pdfStale && pdfFailed && (
        <AuroraButton
          size="sm"
          loading={pdfRetrying}
          disabled={pdfRetrying}
          onClick={() => void retryPdf()}
        >
          {t('retryPdf')}
        </AuroraButton>
      )}
    </div>
  )
}
