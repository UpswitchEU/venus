/**
 * Venus GA4 Event Tracking Service
 *
 * Tracks the full valuation funnel:
 *   Mercury CTA → Venus session → calculation → normalizations → recalc → PDF → return
 *
 * Every event is consent-gated and enriched with `traffic_type`, `locale`,
 * and (when set) `user_role` / `current_plan` so the Venus GA4 property
 * carries the same dimensions Mercury's marketing/app streams do. Routing
 * cross-app cohorts works without a join: pivot on `user_role=advisor` +
 * `current_plan=free` and the Venus events show up alongside the Mercury
 * ones in any GA4 exploration.
 *
 * The helper is a no-op until gtag has loaded AND the user has granted
 * `analytics_storage` consent — emitting before that is both a GDPR risk
 * and a data-quality issue (events from non-consented sessions inflate
 * funnels).
 */

import { isAnalyticsConsentGranted } from './analytics-consent'
import { getAnalyticsContext } from './analytics-context'
import { isInternalEmail } from './is-internal-user'
import {
  capturePostHogOrQueue,
  clearPostHogClientState,
  identifyPostHogOrQueue,
  syncPostHogConsent,
} from './posthog-init'

const VENUS_MEASUREMENT_ID = 'G-0RW0LNCVBG'

let stickyUserRole: string | undefined
let stickyCurrentPlan: string | undefined
let stickyIsInternal = false

function trackEvent(name: string, params?: Record<string, string | number | boolean>): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  if (!isAnalyticsConsentGranted()) return
  try {
    const ctx = getAnalyticsContext()
    // Internal users override `traffic_type` regardless of which Venus
    // surface they're on — without this, staff dogfooding the calculator
    // count as customer `app` traffic and inflate funnel rates.
    const trafficType = stickyIsInternal ? 'internal' : ctx.traffic_type
    const enriched: Record<string, string | number | boolean> = {
      traffic_type: trafficType,
      locale: ctx.locale,
      ...(stickyUserRole ? { user_role: stickyUserRole } : {}),
      ...(stickyCurrentPlan ? { current_plan: stickyCurrentPlan } : {}),
      ...(stickyIsInternal ? { is_internal: 'true' } : {}),
      // Venus is its own GA4 property, but `send_to` is still set so a
      // future cross-property mirror (e.g. forwarding venus_* events into
      // Mercury's app stream for unified funnels) doesn't fan out into all
      // configured streams the way Mercury's pre-fix `trackEvent` did.
      send_to: VENUS_MEASUREMENT_ID,
      ...(params ?? {}),
    }
    window.gtag('event', name, enriched)
  } catch {
    // analytics must never throw into product code
  }
  // Mirror to PostHog (consent-queued; no-op when token not set).
  capturePostHogOrQueue(name, {
    ...(params ?? {}),
    ...(stickyUserRole ? { user_role: stickyUserRole } : {}),
    ...(stickyCurrentPlan ? { current_plan: stickyCurrentPlan } : {}),
    ...(stickyIsInternal ? { is_internal: 'true' } : {}),
  })
}

// ── Identity ─────────────────────────────────────────────────────────

/**
 * Set user ID for cross-device stitching (shared auth with Mercury) and
 * mirror `user_role` / `current_plan` onto every subsequent event so the
 * Venus property segments match the Mercury property segments without a
 * follow-up GA4 join.
 */
export function identifyUser(
  userId: string,
  options?: { role?: string; plan?: string; email?: string }
): void {
  // Always update the sticky cache so subsequent `trackEvent` calls have
  // the latest enrichment, even before gtag has loaded or consent is granted.
  if (options?.role) stickyUserRole = options.role
  if (options?.plan) stickyCurrentPlan = options.plan
  stickyIsInternal = isInternalEmail(options?.email)

  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  if (!isAnalyticsConsentGranted()) return
  try {
    window.gtag('set', { user_id: userId })
    const userProps: Record<string, string> = {
      is_internal: stickyIsInternal ? 'true' : 'false',
    }
    if (options?.role) userProps.user_role = options.role
    if (options?.plan) userProps.current_plan = options.plan
    window.gtag('set', 'user_properties', userProps)
  } catch {
    /* never block UI */
  }
  identifyPostHogOrQueue(userId, options?.role)
}

/** Clear the per-session user identity on sign-out. */
export function clearUserIdentity(): void {
  stickyUserRole = undefined
  stickyCurrentPlan = undefined
  stickyIsInternal = false
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  try {
    window.gtag('set', { user_id: undefined })
    window.gtag('set', 'user_properties', {
      user_role: undefined,
      current_plan: undefined,
      is_internal: undefined,
    })
  } catch {
    /* ignore */
  }
  clearPostHogClientState()
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
  stage?: 'pre_seed' | 'seed' | 'series_a'
): void {
  trackEvent('venus_founder_startup_wizard_step', {
    step,
    ...(stage ? { stage } : {}),
  })
}

/** Founder completed the wizard and the engine returned a result. */
export function trackFounderStartupWizardComplete(
  reportId: string,
  stage?: 'pre_seed' | 'seed' | 'series_a'
): void {
  trackEvent('venus_founder_startup_wizard_complete', {
    report_id: reportId,
    ...(stage ? { stage } : {}),
  })
}

/** Founder downloaded the one-pager PDF from the founder dashboard. */
export function trackFounderStartupPdfDownload(reportId: string): void {
  trackEvent('venus_founder_startup_pdf_download', { report_id: reportId })
}

// ── Studio v2 (UPS-STUDIO-001) ───────────────────────────────────────
//
// Funnel events for the redesigned full-screen valuation wizard that
// replaces the slider-heavy left-rail panel.  Names mirror the legacy
// founder funnel above so we can A/B-compare the two flows.

export type StudioStep =
  | 'profile'
  | 'berkus'
  | 'scorecard'
  | 'founder_pedigree'
  | 'traction'
  | 'exit_story'
  | 'round_simulator'

/**
/**
 * Fires the first time a section's derived status flips to
 * ``'complete'`` during a session. The original "Next click" trigger
 * was retired with the unified scroll-through panel (no more Next /
 * Back buttons); the event now fires off the panel's
 * ``useSectionStatuses`` derivation instead. The event name and shape
 * are preserved so existing funnel dashboards keep reading the same
 * key — only the trigger surface changed.
 *
 * Dedup contract: callers MUST track which steps already fired this
 * event in the current session to avoid one completion firing every
 * render. ``StartupValuationPanel`` does this with a ``Ref<Set>``.
 */
export function trackStudioStepCompleted(
  step: StudioStep,
  stage?: 'pre_seed' | 'seed' | 'series_a'
): void {
  trackEvent('venus_studio_step_completed', {
    step,
    ...(stage ? { stage } : {}),
  })
}

export function trackStudioEvidenceAdded(milestone: string): void {
  trackEvent('venus_studio_evidence_added', { milestone })
}

/**
 * @deprecated Same retirement as `trackStudioStepCompleted` — there is
 * no "blocked Next click" surface in the unified panel; the canonical
 * `StartupSubmitFooter` reflects gating via its disabled state and a
 * helper sentence under the button.  Kept as a no-op stable export so
 * older dashboards do not break on a missing import.  Target removal:
 * 2026-Q3.
 */
export function trackStudioStepBlocked(step: StudioStep, reason: string): void {
  trackEvent('venus_studio_step_blocked', { step, reason })
}

/**
 * Fires whenever the founder lands on a step (after the initial mount).
 * Combined with `venus_studio_step_completed` this gives us drop-off
 * per step — a step with high "viewed" but low "completed" is a UX
 * hot-spot for the next iteration.
 */
export function trackStudioStepViewed(
  step: StudioStep,
  stage?: 'pre_seed' | 'seed' | 'series_a'
): void {
  trackEvent('venus_studio_step_viewed', {
    step,
    ...(stage ? { stage } : {}),
  })
}

export function trackStudioReportShared(method: 'pdf' | 'link' | 'email'): void {
  trackEvent('venus_studio_report_shared', { method })
}

export function trackStudioRunComplete(
  reportId: string,
  stage?: 'pre_seed' | 'seed' | 'series_a'
): void {
  trackEvent('venus_studio_run_complete', {
    report_id: reportId,
    ...(stage ? { stage } : {}),
  })
}

/**
 * Cover chip / report section rendered with the cap-applied framing
 * (OWNER-PROFILING-1 / OP-6). The MVP cap clamps engine adjustments at
 * -15%, so when this fires the underlying owner-dependency signal is
 * steeper than the displayed haircut — material info for SPIKE-1 §5.4 R8.
 *
 * Caller is responsible for deduping by (report_id, mode); a re-render or
 * tab switch should not double-fire. Payload is intentionally minimal —
 * no factor breakdown, no PII.
 *
 * `mode`:
 *   - `'cover_chip'` — Aurora chip on the report cover (Results.tsx)
 *   - `'report_section'` — full Owner Profiling section in HTML/PDF
 *
 * Event name mirrors Mercury's `trackOwnerProfilingCapBindRendered` so
 * cross-app funnels see one name. Mercury → wizard-side cap rate;
 * Venus → report-side cap rate. Diverging rates are a wire-drift signal.
 */
export function trackOwnerProfilingCapBindRendered(payload: {
  reportId: string
  mode: 'cover_chip' | 'report_section'
  riskLevel: string
  appliedPct: number
  rawPct: number
}): void {
  trackEvent('owner_profiling_cap_bind_rendered', {
    report_id: payload.reportId.slice(0, 64),
    mode: payload.mode,
    risk_level: payload.riskLevel.slice(0, 16),
    applied_pct: payload.appliedPct,
    raw_pct: payload.rawPct,
  })
}
