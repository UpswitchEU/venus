'use client'

/**
 * StartupStudioPage
 *
 * Wires the stacked-sections `StudioShell` to the seven step components
 * and delegates final report generation to the existing
 * `/reports/new?flow=startup` pipeline.  Founder state lives in the
 * persisted `useStartupValuationStore` so navigating to /reports/new
 * preserves every milestone, evidence note and TAM input the founder
 * just typed.
 *
 * Unlike the previous wizard surface, all seven sections render
 * top-to-bottom on a single page (matching the DCF / Adaptive / SaaS
 * panel pattern); there is no per-step navigation state to manage here.
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  ADVISOR_HANDOFF_KEY,
  type AdvisorHandoff,
} from '@/components/calculator/sections/startup/StartupAwareInputPanel'
import { BerkusStep } from '@/features/startup-studio/components/BerkusStep'
import { CompanyCardStep } from '@/features/startup-studio/components/CompanyCardStep'
import { ExitStoryStep } from '@/features/startup-studio/components/ExitStoryStep'
import { FounderPedigreeStep } from '@/features/startup-studio/components/FounderPedigreeStep'
import { ReportStep } from '@/features/startup-studio/components/ReportStep'
import { RoundSimulatorStep } from '@/features/startup-studio/components/RoundSimulatorStep'
import { ScorecardStep } from '@/features/startup-studio/components/ScorecardStep'
import { type StudioSection, StudioShell } from '@/features/startup-studio/components/StudioShell'
import { TractionStep } from '@/features/startup-studio/components/TractionStep'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import { buildAdvisorReturnUrl, buildFounderReturnUrl } from './studioReturnUrls'

interface Props {
  locale: 'en' | 'nl'
}

export function StartupStudioPage({ locale }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // One-shot wizard reset — `?reset=1` clears the persisted Studio
  // store before the wizard renders.  Used by:
  //   • Partner landing pages (imec.istart, Start it @KBC) that funnel
  //     a NEW founder into the wizard and must NOT inherit the previous
  //     session's milestone picks.
  //   • Founder dashboard "Start a new valuation" CTAs.
  // Plain navigation to `/startup-valuation` keeps the persisted state
  // intact (the "leave-and-come-back" UX is a feature).
  const resetAppliedRef = useRef(false)
  useEffect(() => {
    if (resetAppliedRef.current) return
    resetAppliedRef.current = true
    if (searchParams?.get('reset') === '1') {
      useStartupValuationStore.getState().reset()
      // Strip the param so a hard refresh doesn't keep wiping inputs.
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.searchParams.delete('reset')
        window.history.replaceState({}, '', url.toString())
      }
    }
  }, [searchParams])

  // Capture `?partner=<slug>` once and stash it on `sessionStorage` so
  // the analytics events fired across step transitions (and downstream
  // /reports/new) can attribute the run to the right partner. Pure
  // session storage (not Zustand) keeps the wizard state portable across
  // partners without polluting the persisted store.
  const partnerCapturedRef = useRef(false)
  useEffect(() => {
    if (partnerCapturedRef.current) return
    if (typeof window === 'undefined') return
    partnerCapturedRef.current = true
    const partner = searchParams?.get('partner')
    if (partner) {
      try {
        window.sessionStorage.setItem('upswitch.studio.partner', partner)
      } catch {
        // sessionStorage disabled (incognito/Safari) — silently skip
      }
    }
  }, [searchParams])

  const handleSubmit = async () => {
    // Idempotency guard — if the user double-taps "Generate" we would
    // otherwise call `router.push` twice and create two reports.
    if (isSubmitting) return
    setIsSubmitting(true)
    let partnerSuffix = ''
    let advisorHandoff: AdvisorHandoff | null = null
    // The advisor handoff is gated by the `?from=advisor` URL signal
    // that `useStartupStudioRedirect` writes when redirecting from the
    // Mercury flow.  Without this gate a stale sessionStorage payload
    // (advisor abandoned mid-wizard) would misroute the next founder's
    // submission to the wrong report id — i.e. cross-client data leak.
    const fromAdvisorRedirect = searchParams?.get('from') === 'advisor'
    if (typeof window !== 'undefined') {
      try {
        const partner = window.sessionStorage.getItem('upswitch.studio.partner')
        if (partner) partnerSuffix = `&partner=${encodeURIComponent(partner)}`
      } catch {
        // ignore
      }
      if (fromAdvisorRedirect) {
        try {
          const raw = window.sessionStorage.getItem(ADVISOR_HANDOFF_KEY)
          if (raw) {
            advisorHandoff = JSON.parse(raw) as AdvisorHandoff
          }
        } catch {
          // Stale / unparseable handoff — fall back to founder default
          // (the wizard still produces a valid report, just on a fresh id).
          advisorHandoff = null
        }
      }
    }

    // Persisted Zustand state already carries every wizard input.
    // `selected_method=startup_valuation` is the cross-app contract
    // recognised by `usePreSelectedMethodSessionSync`, so the report
    // page lands directly on the venture method instead of
    // `upswitch_adaptive`.
    //
    // Two destinations:
    //   • Advisor (Mercury hand-off): push back to the SAME report id
    //     captured on wizard entry, preserving Mercury context
    //     (mode/clientId/return_url/source=mercury) so the bootstrap
    //     fallback can restore accountant-for-client identity.  We
    //     signal "just completed the wizard" via `studio_completed=1`
    //     (NOT `source=studio_v2`, which would clobber `source=mercury`
    //     and break the bootstrap fallback path).
    //   • Founder: push to `/reports/new` to create a fresh report id;
    //     legacy contract uses `source=studio_v2` for the same auto-fire
    //     and redirect-bypass signals.
    try {
      if (advisorHandoff?.reportId) {
        router.push(buildAdvisorReturnUrl(advisorHandoff, partnerSuffix))
        // Clear AFTER navigation dispatches so a thrown push doesn't
        // strand the retry on the founder fallback path.  `router.push`
        // in app-router doesn't throw synchronously, but the catch
        // below exists for paranoia and we want `setIsSubmitting(false)`
        // → user clicks retry → handoff still readable → correct route.
        try {
          window.sessionStorage.removeItem(ADVISOR_HANDOFF_KEY)
        } catch {
          // Failing to clear is not fatal — the next advisor capture
          // overwrites the key, and the URL signal `?from=advisor`
          // gates consumption regardless.
        }
      } else {
        router.push(buildFounderReturnUrl(locale, partnerSuffix))
      }
    } catch (err) {
      // Reset so the user can retry — `ReportStep`'s `handleSubmit`
      // catches the rethrown error and surfaces a localised message.
      setIsSubmitting(false)
      throw err
    }
  }

  const sections: StudioSection[] = [
    { id: 'profile', content: <CompanyCardStep locale={locale} /> },
    { id: 'berkus', content: <BerkusStep locale={locale} /> },
    { id: 'scorecard', content: <ScorecardStep locale={locale} /> },
    { id: 'founder_pedigree', content: <FounderPedigreeStep locale={locale} /> },
    { id: 'traction', content: <TractionStep locale={locale} /> },
    { id: 'exit_story', content: <ExitStoryStep locale={locale} /> },
    { id: 'round_simulator', content: <RoundSimulatorStep locale={locale} /> },
    {
      id: 'report',
      content: <ReportStep locale={locale} onSubmit={handleSubmit} isSubmitting={isSubmitting} />,
    },
  ]

  return (
    <StudioShell
      sections={sections}
      onComplete={handleSubmit}
      locale={locale}
      isCompleting={isSubmitting}
    />
  )
}
