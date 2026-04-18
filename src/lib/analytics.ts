/**
 * Venus GA4 Event Tracking Service
 *
 * Tracks the full valuation funnel:
 *   Mercury CTA → Venus session → calculation → normalizations → recalc → PDF → return
 *
 * All events are no-ops when gtag hasn't loaded (before consent).
 */

function trackEvent(name: string, params?: Record<string, string | number | boolean>): void {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', name, params)
  }
}

// ── Identity ─────────────────────────────────────────────────────────

/** Set user ID for cross-device stitching (shared auth with Mercury) */
export function identifyUser(userId: string, role?: string): void {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('set', { user_id: userId })
    if (role) {
      window.gtag('set', 'user_properties', { user_role: role })
    }
  }
}

// ── Session & Navigation ─────────────────────────────────────────────

/** User lands on Venus (from Mercury redirect or direct) */
export function trackSessionStart(source: string): void {
  trackEvent('venus_session_start', { source })
}

/** User navigates back to Mercury */
export function trackReturnToMercury(): void {
  trackEvent('venus_return_to_mercury')
}

/** User opens an existing report */
export function trackReportOpen(reportId: string): void {
  trackEvent('venus_report_open', { report_id: reportId })
}

/** User creates a new report */
export function trackReportCreate(): void {
  trackEvent('venus_report_create')
}

// ── Valuation Calculation ────────────────────────────────────────────

/** User submits form to calculate valuation */
export function trackValuationCalculate(isRecalculation: boolean): void {
  trackEvent('venus_valuation_calculate', {
    is_recalculation: isRecalculation,
  })
}

/** User hovers or clicks a disabled valuation method (DCF, Market Multiples) - Painted Door demand signal */
export function trackValuationMethodComingSoon(method: string, action: 'click' | 'hover'): void {
  trackEvent('venus_valuation_method_coming_soon', { method, action })
}

/** Valuation calculation completes successfully */
export function trackValuationResult(
  durationMs: number,
  reportId: string,
  isRecalculation: boolean
): void {
  trackEvent('venus_valuation_result', {
    duration_ms: Math.round(durationMs),
    report_id: reportId,
    is_recalculation: isRecalculation,
  })
}

// ── Normalizations ───────────────────────────────────────────────────

/** User opens the normalization modal/hub */
export function trackNormalizationOpen(): void {
  trackEvent('venus_normalization_open')
}

/** User adds a normalization adjustment */
export function trackNormalizationAdd(source: 'manual' | 'ai'): void {
  trackEvent('venus_normalization_add', { source })
}

/** User edits a normalization */
export function trackNormalizationEdit(): void {
  trackEvent('venus_normalization_edit')
}

/** User accepts all AI-suggested normalizations */
export function trackNormalizationAcceptAll(count: number): void {
  trackEvent('venus_normalization_accept_all', { count })
}

// ── AI Assistant ─────────────────────────────────────────────────────

/** User opens the AI assistant drawer */
export function trackAIAssistantOpen(): void {
  trackEvent('venus_ai_assistant_open')
}

/** User sends a message to the AI assistant */
export function trackAIAssistantMessage(): void {
  trackEvent('venus_ai_assistant_message')
}

/** User accepts an AI-suggested normalization from chat */
export function trackAINormalizationAccept(): void {
  trackEvent('venus_ai_normalization_accept')
}

/** User accepts an AI field update from chat */
export function trackAIFieldUpdate(): void {
  trackEvent('venus_ai_field_update')
}

// ── Version Control ──────────────────────────────────────────────────

/** User opens the version history panel */
export function trackVersionHistoryOpen(): void {
  trackEvent('venus_version_history_open')
}

/** User restores a previous version */
export function trackVersionRestore(versionNumber: number): void {
  trackEvent('venus_version_restore', { version_number: versionNumber })
}

/** User starts a version comparison */
export function trackVersionCompare(): void {
  trackEvent('venus_version_compare')
}

// ── Export & Viewing ─────────────────────────────────────────────────

/** User downloads a PDF report */
export function trackPDFDownload(): void {
  trackEvent('venus_pdf_download')
}

/** User enters fullscreen report view */
export function trackFullscreenOpen(): void {
  trackEvent('venus_fullscreen_open')
}

/** User opens report preview */
export function trackPreviewOpen(): void {
  trackEvent('venus_preview_open')
}

/** A valuation paywall is shown */
export function trackPaywallShown(source: 'bootstrap_credit' | 'session_credit'): void {
  trackEvent('venus_paywall_shown', { source })
}

/** User clicks upgrade from a Venus paywall */
export function trackPaywallUpgradeClick(source: 'bootstrap_credit' | 'session_credit'): void {
  trackEvent('venus_paywall_upgrade_click', { source })
}

// ── Founder Startup Wizard (UPS-STARTUP-001) ─────────────────────────
//
// Funnel events for the new venture / pre-revenue valuation flow that
// founders enter from the Mercury KBO bypass screen and the dashboard
// tile.  Names mirror the Mercury counterparts in
// `apps/mercury/shared/lib/analytics.ts` so PostHog can stitch the
// two surfaces into a single funnel.

export type FounderStartupWizardStep = 'milestones' | 'traction' | 'exit' | 'review'

/** Founder advanced to a wizard step (impression of the step). */
export function trackFounderStartupWizardStep(
  step: FounderStartupWizardStep,
  stage?: 'pre_seed' | 'seed' | 'series_a',
): void {
  trackEvent('venus_founder_startup_wizard_step', {
    step,
    ...(stage ? { stage } : {}),
  })
}

/** Founder completed the wizard and the engine returned a result. */
export function trackFounderStartupWizardComplete(
  reportId: string,
  stage?: 'pre_seed' | 'seed' | 'series_a',
): void {
  trackEvent('venus_founder_startup_wizard_complete', {
    report_id: reportId,
    ...(stage ? { stage } : {}),
  })
}

/** Founder clicked "Invite my Accountant" from the founder dashboard. */
export function trackFounderStartupInvite(method: 'cta' | 'copy_link' | 'email'): void {
  trackEvent('venus_founder_startup_invite', { method })
}

/** Founder downloaded the one-pager PDF from the founder dashboard. */
export function trackFounderStartupPdfDownload(reportId: string): void {
  trackEvent('venus_founder_startup_pdf_download', { report_id: reportId })
}
