'use client'

import { CheckCircle2, ExternalLink, FileCheck2, Loader2, ShieldCheck, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type {
  AdvisorApprovalCheck,
  AdvisorApprovalDialogController,
} from '../hooks/useManualReportApproval'

interface AdvisorApprovalDialogProps extends AdvisorApprovalDialogController {
  locale: string
}

const COPY = {
  nl: {
    title: 'Waarderingsmemorandum goedkeuren',
    intro:
      'Bevestig eerst de inhoudelijke controles. Daarna maakt Upswitch één onveranderlijke PDF voor je eindcontrole. Je goedkeuring geldt uitsluitend voor die exacte SHA-256.',
    prepare: 'Maak PDF voor eindcontrole',
    preparing: 'PDF wordt gemaakt…',
    openPdf: 'Open exacte PDF',
    hash: 'Digitale vingerafdruk',
    final: 'Ik heb deze exacte PDF volledig nagekeken en keur ze goed.',
    notes: 'Notitie bij de goedkeuring (optioneel)',
    approve: 'Exacte PDF goedkeuren',
    approving: 'Goedkeuring wordt vastgelegd…',
    close: 'Sluiten',
  },
  fr: {
    title: 'Approuver le mémorandum de valorisation',
    intro:
      'Confirmez d’abord les contrôles de fond. Upswitch créera ensuite un PDF immuable pour votre contrôle final. Votre approbation ne vaudra que pour ce SHA-256 exact.',
    prepare: 'Créer le PDF pour contrôle final',
    preparing: 'Création du PDF…',
    openPdf: 'Ouvrir le PDF exact',
    hash: 'Empreinte numérique',
    final: 'J’ai entièrement contrôlé ce PDF exact et je l’approuve.',
    notes: 'Note d’approbation (facultatif)',
    approve: 'Approuver le PDF exact',
    approving: 'Enregistrement de l’approbation…',
    close: 'Fermer',
  },
  en: {
    title: 'Approve valuation memorandum',
    intro:
      'Confirm the substantive checks first. Upswitch will then create one immutable PDF for final review. Your approval applies only to that exact SHA-256.',
    prepare: 'Create PDF for final review',
    preparing: 'Creating PDF…',
    openPdf: 'Open exact PDF',
    hash: 'Digital fingerprint',
    final: 'I reviewed this exact PDF in full and approve it.',
    notes: 'Approval note (optional)',
    approve: 'Approve exact PDF',
    approving: 'Recording approval…',
    close: 'Close',
  },
} as const

const CHECK_LABELS: Record<AdvisorApprovalCheck, Record<'nl' | 'fr' | 'en', string>> = {
  scope: {
    nl: 'Opdracht, doel en beoogde gebruikers',
    fr: 'Mandat, objet et utilisateurs',
    en: 'Scope, purpose and intended users',
  },
  identity: {
    nl: 'Vennootschap, belang en identiteit',
    fr: 'Société, intérêt et identité',
    en: 'Company, interest and identity',
  },
  closed_periods: {
    nl: 'Afgesloten periodes en brondata',
    fr: 'Périodes clôturées et données sources',
    en: 'Closed periods and source data',
  },
  normalizations: {
    nl: 'EBITDA-normalisaties en beslissingen',
    fr: 'Normalisations EBITDA et décisions',
    en: 'EBITDA normalisations and decisions',
  },
  business_type: {
    nl: 'Activiteit, NACE en bedrijfstype',
    fr: 'Activité, NACE et type d’entreprise',
    en: 'Activity, NACE and business type',
  },
  method: {
    nl: 'Gekozen en verworpen methodes',
    fr: 'Méthodes retenues et écartées',
    en: 'Selected and rejected methods',
  },
  benchmark: {
    nl: 'Benchmark, herkomst en steekproefsterkte',
    fr: 'Benchmark, provenance et solidité',
    en: 'Benchmark, provenance and sample strength',
  },
  balance_sheet: {
    nl: 'Balans, activa en verplichtingen',
    fr: 'Bilan, actifs et engagements',
    en: 'Balance sheet, assets and liabilities',
  },
  net_debt: {
    nl: 'Schuld, cash en EV-naar-equitybrug',
    fr: 'Dette, trésorerie et pont EV-capitaux propres',
    en: 'Debt, cash and EV-to-equity bridge',
  },
  final_pdf: {
    nl: 'Exacte PDF-eindcontrole',
    fr: 'Contrôle final du PDF exact',
    en: 'Exact PDF final review',
  },
}

const PREFLIGHT_CHECKS = Object.keys(CHECK_LABELS).filter(
  (key): key is AdvisorApprovalCheck => key !== 'final_pdf'
)

export function AdvisorApprovalDialog({
  candidate,
  checklist,
  close,
  confirm,
  isApproving,
  isPreparingCandidate,
  locale,
  notes,
  open,
  prepareCandidate,
  setCheck,
  setNotes,
}: AdvisorApprovalDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    closeButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [close, open])

  if (!open) return null
  const language = locale.toLowerCase().startsWith('fr')
    ? 'fr'
    : locale.toLowerCase().startsWith('en')
      ? 'en'
      : 'nl'
  const copy = COPY[language]
  const preflightComplete = PREFLIGHT_CHECKS.every((key) => checklist[key])
  const busy = isPreparingCandidate || isApproving

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="advisor-approval-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex gap-3">
            <span className="mt-0.5 rounded-xl bg-teal-50 p-2 text-teal-700">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 id="advisor-approval-title" className="text-lg font-semibold text-slate-950">
                {copy.title}
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{copy.intro}</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            disabled={busy}
            aria-label={copy.close}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="overflow-y-auto px-6 py-5">
          <div className="grid gap-2 sm:grid-cols-2">
            {PREFLIGHT_CHECKS.map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 hover:border-teal-300 hover:bg-teal-50/40"
              >
                <input
                  type="checkbox"
                  checked={checklist[key]}
                  disabled={busy}
                  onChange={(event) => setCheck(key, event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-teal-700"
                />
                <span className="text-sm leading-5 text-slate-800">
                  {CHECK_LABELS[key][language]}
                </span>
              </label>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            {!candidate ? (
              <button
                type="button"
                onClick={() => void prepareCandidate()}
                disabled={!preflightComplete || busy}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPreparingCandidate ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileCheck2 className="h-4 w-4" />
                )}
                {isPreparingCandidate ? copy.preparing : copy.prepare}
              </button>
            ) : (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" /> PDF/A-2b
                  </span>
                  <a
                    href={candidate.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {copy.openPdf}
                  </a>
                </div>
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                  {copy.hash}
                </p>
                <code className="mt-1 block break-all rounded-lg bg-white p-3 text-[11px] text-slate-700 ring-1 ring-slate-200">
                  SHA-256 {candidate.pdfSha256}
                </code>
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <input
                    type="checkbox"
                    checked={checklist.final_pdf}
                    disabled={busy}
                    onChange={(event) => setCheck('final_pdf', event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-emerald-700"
                  />
                  <span className="text-sm font-medium leading-5 text-emerald-950">
                    {copy.final}
                  </span>
                </label>
              </div>
            )}
          </div>

          <label className="mt-5 block text-sm font-medium text-slate-800">
            {copy.notes}
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value.slice(0, 4000))}
              disabled={busy}
              rows={3}
              className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </label>
        </div>

        <footer className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            {copy.close}
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={!candidate || !checklist.final_pdf || busy}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isApproving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {isApproving ? copy.approving : copy.approve}
          </button>
        </footer>
      </section>
    </div>
  )
}
