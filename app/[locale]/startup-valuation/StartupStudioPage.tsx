'use client'

/**
 * StartupStudioPage
 *
 * Client wrapper that wires the `StudioShell` to the seven step
 * components and delegates final report generation to the existing
 * `/reports/new?flow=startup` pipeline.  Founder state lives in the
 * persisted `useStartupValuationStore` so navigating to /reports/new
 * preserves every milestone, evidence note and TAM input the founder
 * just typed.
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { StudioShell } from '@/features/startup-studio/components/StudioShell'
import { ProfileStep } from '@/features/startup-studio/components/ProfileStep'
import { BerkusStep } from '@/features/startup-studio/components/BerkusStep'
import { ScorecardStep } from '@/features/startup-studio/components/ScorecardStep'
import { TractionStep } from '@/features/startup-studio/components/TractionStep'
import { ExitStoryStep } from '@/features/startup-studio/components/ExitStoryStep'
import { RoundSimulatorStep } from '@/features/startup-studio/components/RoundSimulatorStep'
import { ReportStep } from '@/features/startup-studio/components/ReportStep'

interface Props {
  locale: 'en' | 'nl'
}

export function StartupStudioPage({ locale }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentStep, setCurrentStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

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
    // Idempotency guard — if the founder double-taps "Generate" we
    // would otherwise call `router.push` twice and create two reports.
    if (isSubmitting) return
    setIsSubmitting(true)
    let partnerSuffix = ''
    if (typeof window !== 'undefined') {
      try {
        const partner = window.sessionStorage.getItem('upswitch.studio.partner')
        if (partner) partnerSuffix = `&partner=${encodeURIComponent(partner)}`
      } catch {
        // ignore
      }
    }
    // Persisted Zustand state already carries every wizard input —
    // /reports/new will create a fresh report id then `ManualLayout`
    // hydrates from the store and runs `startup_valuation` through
    // ValuationIQ.  We tag the source so downstream analytics can split
    // Studio runs from the legacy slider panel, and pass
    // `selected_method=startup_valuation` (the cross-app contract recognised
    // by `usePreSelectedMethodSessionSync`) so the report page lands
    // directly on the venture method instead of `upswitch_adaptive`.
    try {
      router.push(
        `/${locale}/reports/new?selected_method=startup_valuation&source=studio_v2${partnerSuffix}`,
      )
    } catch (err) {
      // Reset so the founder can retry — `ReportStep`'s `handleSubmit`
      // catches the rethrown error and surfaces a localised message.
      setIsSubmitting(false)
      throw err
    }
  }

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <ProfileStep locale={locale} />
      case 1:
        return <BerkusStep locale={locale} />
      case 2:
        return <ScorecardStep locale={locale} />
      case 3:
        return <TractionStep locale={locale} />
      case 4:
        return <ExitStoryStep locale={locale} />
      case 5:
        return <RoundSimulatorStep locale={locale} />
      case 6:
        return (
          <ReportStep
            locale={locale}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        )
      default:
        return null
    }
  }

  return (
    <StudioShell
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      onComplete={handleSubmit}
      locale={locale}
      isCompleting={isSubmitting}
    >
      {renderStep()}
    </StudioShell>
  )
}
