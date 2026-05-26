import { LockKeyhole } from 'lucide-react'
import { getStarterPlanSummary } from '../../../constants/pricing'
import { getMercuryUrl } from '../../../utils/getMercuryUrl'
import {
  buildManualMercuryBusinessDashboardUrl,
  buildManualMercuryPricingUrl,
} from '../utils/manualMercuryNavigation'

export type ManualStarterPaywallReason =
  | 'methods'
  | 'normalization'
  | 'version_history'
  | 'synthesis'
  | 'pdf_download'

export interface ManualStarterPaywallModalProps {
  currentLocale: string
  isAdvisorAudience: boolean
  onClose: () => void
  open: boolean
  reason: ManualStarterPaywallReason
}

function getManualStarterPaywallTitle({
  isBusinessOwnerAudience,
  locale,
  reason,
}: {
  isBusinessOwnerAudience: boolean
  locale: string
  reason: ManualStarterPaywallReason
}): string {
  const isDutch = locale === 'nl'

  if (reason === 'methods') {
    if (isDutch)
      return isBusinessOwnerAudience
        ? 'Meer methodes via uw adviseur'
        : 'Upgrade voor alle methodes'
    return isBusinessOwnerAudience ? 'More methods via your advisor' : 'Upgrade for all methods'
  }
  if (reason === 'normalization') {
    if (isDutch) {
      return isBusinessOwnerAudience
        ? 'Normalisaties via uw adviseur'
        : 'EBITDA-normalisatie & belastinglatenties'
    }
    return isBusinessOwnerAudience
      ? 'Normalization via your advisor'
      : 'EBITDA normalization & tax latencies'
  }
  if (reason === 'version_history') {
    if (isDutch) {
      return isBusinessOwnerAudience
        ? 'Versiebeheer via uw adviseur'
        : 'Overschrijven, verfijnen & auditspoor'
    }
    return isBusinessOwnerAudience
      ? 'Version control via your advisor'
      : 'Overwrite, refine & audit trail'
  }
  if (reason === 'synthesis') {
    if (isDutch) {
      return isBusinessOwnerAudience ? 'Waarderingssynthese via uw adviseur' : 'Waarderingssynthese'
    }
    return isBusinessOwnerAudience ? 'Valuation synthesis via your advisor' : 'Valuation Synthesis'
  }

  if (isDutch) {
    return isBusinessOwnerAudience
      ? 'Krijg uw merkrapport — deel met uw adviseur'
      : 'PDF-download vanaf Starter'
  }
  return isBusinessOwnerAudience
    ? 'Get your branded report — share with your advisor'
    : 'PDF download from Starter'
}

function getManualStarterPaywallBody({
  isBusinessOwnerAudience,
  locale,
  reason,
}: {
  isBusinessOwnerAudience: boolean
  locale: string
  reason: ManualStarterPaywallReason
}): string {
  const isDutch = locale === 'nl'

  if (isBusinessOwnerAudience) {
    if (isDutch) {
      return reason === 'pdf_download'
        ? 'Uw gratis rapport blijft online beschikbaar met watermerk. Voor een merkversie zonder watermerk in PDF: nodig uw boekhouder of M&A-adviseur uit. Zij beheren het abonnement — voor u blijft alles gratis.'
        : 'Deze functie is onderdeel van het Starter-abonnement van uw adviseur. Nodig uw boekhouder of M&A-adviseur uit zodat zij deze functies voor uw rapport kunnen ontgrendelen — voor u blijft het gebruik gratis.'
    }
    return reason === 'pdf_download'
      ? 'Your free report stays available online with a watermark. For a branded watermark-free PDF, invite your accountant or M&A advisor. They manage the subscription — your access stays free.'
      : 'This feature is part of your advisor’s Starter plan. Invite your accountant or M&A advisor so they can unlock these features on your report — your access stays free.'
  }

  if (isDutch) {
    if (reason === 'methods') {
      return 'Je gratis plan bevat Upswitch adaptieve marktbenadering, DCF, EBITDA, gecorrigeerd NAV en liquidatiewaarde (read-only, geen PDF-download). Upgrade naar Starter voor alle 10 methodes, manuele controle over elke aanpassing, downloadbare rapporten zonder watermerk in uw huisstijl en live Benelux sector-multiples.'
    }
    if (reason === 'normalization') {
      return 'De volledige normalisatiehub (incl. belastinglatenties) zit in Starter. Je krijgt ook gepersonaliseerde PDF-rapporten, volledige manuele controle en de mogelijkheid om waarderingen te overschrijven met volledig auditspoor.'
    }
    if (reason === 'version_history') {
      return 'Overschrijven & verfijnen bij wijzigende cijfers — met volledig auditspoor — vanaf Starter.'
    }
    if (reason === 'synthesis') {
      return 'Combineer meerdere waarderingsmethodes met een gewogen gemiddelde en verdedig uw keuze in het PDF-rapport. Upgrade naar Starter voor de volledige waarderingssynthese.'
    }
    return 'Uw gratis rapport is read-only met watermerk. Upgrade naar Starter voor downloadbare PDF-rapporten zonder watermerk in uw huisstijl en alle 9 methodes.'
  }

  if (reason === 'methods') {
    return 'Your free plan includes Upswitch adaptive market approach, DCF, EBITDA, and adjusted NAV (read-only, no PDF download). Upgrade to Starter for all valuation methods, manual control over every adjustment, downloadable watermark-free branded reports, and live Benelux sector multiples.'
  }
  if (reason === 'normalization') {
    return 'The full normalization hub (incl. tax latencies) is on Starter together with branded PDFs, full manual control, and the ability to overwrite valuations with full audit trail.'
  }
  if (reason === 'version_history') {
    return 'Overwrite & refine as financials evolve — with full audit trail — from Starter.'
  }
  if (reason === 'synthesis') {
    return 'Blend multiple valuation methods with weighted averages and defend your choice in the PDF report. Upgrade to Starter for the full valuation synthesis.'
  }
  return 'Your free report is read-only with a watermark. Upgrade to Starter for downloadable watermark-free PDF reports with your branding and all valuation methods.'
}

export function ManualStarterPaywallModal({
  currentLocale,
  isAdvisorAudience,
  onClose,
  open,
  reason,
}: ManualStarterPaywallModalProps) {
  if (!open) return null

  const isBusinessOwnerAudience = !isAdvisorAudience
  const mercuryUrl = getMercuryUrl()
  const ctaHref = isBusinessOwnerAudience
    ? buildManualMercuryBusinessDashboardUrl({ mercuryUrl, locale: currentLocale })
    : buildManualMercuryPricingUrl({ mercuryUrl, locale: currentLocale })
  const ctaLabel = isBusinessOwnerAudience
    ? currentLocale === 'nl'
      ? 'Open mijn dashboard'
      : 'Open my dashboard'
    : getStarterPlanSummary(currentLocale)

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-popover border border-foreground/10 rounded-xl p-6 max-w-md w-full shadow-xl">
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <LockKeyhole className="h-6 w-6 text-primary" aria-hidden />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {getManualStarterPaywallTitle({
              isBusinessOwnerAudience,
              locale: currentLocale,
              reason,
            })}
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {getManualStarterPaywallBody({
              isBusinessOwnerAudience,
              locale: currentLocale,
              reason,
            })}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-muted hover:bg-foreground/10 text-foreground text-sm font-medium rounded-lg transition-colors"
          >
            {currentLocale === 'nl' ? 'Sluiten' : 'Close'}
          </button>
          <a
            href={ctaHref}
            className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-lg transition-colors text-center"
          >
            {ctaLabel}
          </a>
        </div>
      </div>
    </div>
  )
}
