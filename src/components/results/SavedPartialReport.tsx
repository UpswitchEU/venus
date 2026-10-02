'use client'

import { useEffect, useRef, useState } from 'react'
import { requestPdfDownload } from '@/hooks/pdfGenerationClient'
import { useClientContext } from '@/stores/clientContext'
import { reportRecord } from '@/utils/indicativeReportExport'
import { savedPartialAssessment, savedPartialExportRequest } from '@/utils/partialReportExport'

const getClientContextHeaders = () => useClientContext.getState().getContextHeaders()

const copy = {
  en: {
    title: 'Automatic indicative assessment',
    loading: 'Loading saved assessment…',
    pdf: 'Download PDF',
    error: 'The saved report could not be loaded. Reload the page and try again.',
    paywall: 'PDF download requires an eligible plan.',
  },
  nl: {
    title: 'Automatische indicatieve beoordeling',
    loading: 'Opgeslagen beoordeling laden…',
    pdf: 'PDF downloaden',
    error: 'Het opgeslagen rapport kon niet worden geladen. Vernieuw de pagina en probeer opnieuw.',
    paywall: 'Voor de PDF-download is een geschikt abonnement vereist.',
  },
  fr: {
    title: 'Évaluation indicative automatique',
    loading: 'Chargement de l’évaluation enregistrée…',
    pdf: 'Télécharger le PDF',
    error: 'Le rapport enregistré n’a pas pu être chargé. Actualisez la page et réessayez.',
    paywall: 'Le téléchargement du PDF nécessite un abonnement adapté.',
  },
}

/** The screen projects the same engine HTML as exports; no scalar fallback, FX,
 * rounding or midpoint calculation occurs in the browser. */
export function SavedPartialReport({
  reportId,
  report,
  language,
}: {
  reportId: string
  report: unknown
  language: string
}) {
  const locale = language === 'fr' || language === 'nl' ? language : 'en'
  const text = copy[locale]
  const downloadAbort = useRef<AbortController | null>(null)
  const contentHash = savedPartialAssessment(report)?.content_sha256
  const [html, setHtml] = useState('')
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    downloadAbort.current?.abort()
    downloadAbort.current = null
    setDownloading(false)
    setHtml('')
    setError('')
    async function load() {
      try {
        const head = await fetch(
          `/api/valuations/reports/${encodeURIComponent(reportId)}/partial-calculation`,
          {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
            headers: getClientContextHeaders(),
          }
        )
        if (!head.ok) throw new Error('Saved report unavailable')
        const options = savedPartialExportRequest(await head.json(), locale, false)
        if (!options || options.expected_content_sha256 !== contentHash)
          throw new Error('Saved calculation changed')
        const response = await fetch(
          `/api/valuations/reports/${encodeURIComponent(reportId)}/partial-export`,
          {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
            headers: { ...getClientContextHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(options),
          }
        )
        if (!response.ok) throw new Error('Saved report unavailable')
        const body = reportRecord(await response.json())
        const manifest = reportRecord(body.report_manifest)
        if (
          manifest.content_sha256 !== options.expected_content_sha256 ||
          manifest.report_id !== reportId ||
          manifest.language !== locale ||
          typeof body.html_report !== 'string'
        )
          throw new Error('Wrong saved report')
        if (!controller.signal.aborted) setHtml(body.html_report)
      } catch {
        if (!controller.signal.aborted) setError(text.error)
      }
    }
    void load()
    return () => {
      controller.abort()
      downloadAbort.current?.abort()
    }
  }, [reportId, contentHash, locale, text.error])
  async function download() {
    if (downloadAbort.current) return
    const controller = new AbortController()
    downloadAbort.current = controller
    setDownloading(true)
    setError('')
    try {
      const response = await requestPdfDownload({
        reportId,
        savedReport: report,
        language: locale,
        headers: getClientContextHeaders(),
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (!response.ok) {
        setError(response.status === 402 ? text.paywall : text.error)
        return
      }
      const blob = await response.blob()
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `valuation-${reportId}-${locale}.pdf`
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 402
            ? text.paywall
            : text.error
        )
    } finally {
      if (downloadAbort.current === controller) downloadAbort.current = null
      if (!controller.signal.aborted) setDownloading(false)
    }
  }
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{text.title}</h1>
        <button
          type="button"
          onClick={() => void download()}
          disabled={downloading || !html}
          className="rounded border px-4 py-2 disabled:opacity-50"
        >
          {text.pdf}
        </button>
      </div>
      {error && (
        <p role="alert" className="mb-4">
          {error}
        </p>
      )}
      {!html && !error && <p role="status">{text.loading}</p>}
      {html && (
        <iframe
          title={text.title}
          srcDoc={html}
          sandbox=""
          className="min-h-[1100px] w-full border-0"
        />
      )}
    </main>
  )
}
