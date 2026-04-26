'use client'

/**
 * StudioShell
 * -----------
 *
 * Two-column wizard frame for the Studio v2 valuation flow.
 *
 *   [ progress bar ]
 *   ┌──────────── current step (max-w-3xl) ────────────┐  ┌── live receipt (w-96) ──┐
 *   │                                                   │  │                          │
 *   │                                                   │  │   sticky right rail      │
 *   └───────────────────────────────────────────────────┘  └──────────────────────────┘
 *   [ ← back ]                                  [ next → ]
 *
 * Replaces `ManualLayout`'s 35%-rail constraint that caused the
 * "labels cut off at 50%" UX bug founders reported.  On mobile the
 * receipt collapses into a sticky bottom drawer.
 */

import { motion } from 'framer-motion'
import { AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { AuroraButton } from '@/design-system/components/Button'
import { StepProgress } from '@/design-system/components/Progress'
import { LiveReceipt } from './LiveReceipt'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import { useLiveValuation } from '@/features/startup-studio/hooks/useLiveValuation'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import {
  trackStudioStepBlocked,
  trackStudioStepCompleted,
  trackStudioStepViewed,
  type StudioStep,
} from '@/lib/analytics'

export interface StudioStepDef {
  id: StudioStep
  label: { en: string; nl: string }
}

export const STUDIO_STEPS: StudioStepDef[] = [
  { id: 'profile', label: { en: 'Profile', nl: 'Profiel' } },
  { id: 'berkus', label: { en: 'Risk reduction', nl: 'Risico-reductie' } },
  { id: 'scorecard', label: { en: 'Defensibility', nl: 'Defensibility' } },
  { id: 'founder_pedigree', label: { en: 'Team pedigree', nl: 'Team' } },
  { id: 'traction', label: { en: 'Traction', nl: 'Tractie' } },
  { id: 'exit_story', label: { en: 'Exit story', nl: 'Exit-verhaal' } },
  { id: 'round_simulator', label: { en: 'Round', nl: 'Ronde' } },
  { id: 'report', label: { en: 'Report', nl: 'Rapport' } },
]

interface StudioShellProps {
  currentStep: number
  onStepChange: (next: number) => void
  onComplete?: () => void
  children: ReactNode
  locale?: 'en' | 'nl'
  isCompleting?: boolean
}

export function StudioShell({
  currentStep,
  onStepChange,
  onComplete,
  children,
  locale = 'en',
  isCompleting,
}: StudioShellProps) {
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const maturity = useStartupValuationStore((s) => s.maturity)
  const { benchmark, isFallback, publishedAt } = useStartupBenchmark(country, stage, sector)
  const valuation = useLiveValuation(benchmark)
  const companyName = useManualFormStore((s) => s.formData.company_name ?? '')

  const stepDef = STUDIO_STEPS[currentStep]
  const isFirst = currentStep === 0
  const isLast = currentStep === STUDIO_STEPS.length - 1

  // Fire `step_viewed` exactly once per (step, mount) — the dependency
  // on `currentStep` ensures every navigation logs a fresh event, while
  // `lastViewedRef` guards against React StrictMode double-invocation
  // and benchmark-driven re-renders.
  const lastViewedRef = useRef<number | null>(null)
  useEffect(() => {
    if (!stepDef) return
    if (lastViewedRef.current === currentStep) return
    lastViewedRef.current = currentStep
    trackStudioStepViewed(stepDef.id, stage)
  }, [currentStep, stepDef, stage])

  // Per-step gate. Returns null when the step is complete enough to
  // advance, or a localised "what's missing" sentence we surface in a
  // small inline tooltip + analytics event.
  const blocker = useMemo<string | null>(() => {
    if (!stepDef) return null
    switch (stepDef.id) {
      case 'profile':
        if (!companyName.trim()) {
          return locale === 'nl'
            ? 'Geef je bedrijfsnaam op om verder te gaan.'
            : 'Add a company name to continue.'
        }
        if (!stage || !sector || !country) {
          return locale === 'nl'
            ? 'Kies stage, sector en land voor we de regionale benchmark kunnen ophalen.'
            : 'Pick stage, sector and country before we can fetch the regional benchmark.'
        }
        return null
      case 'berkus': {
        // Need at least one milestone evidenced — otherwise the live
        // valuation reads €0 and the founder would be confused on Step 6.
        const anyPicked = Object.values(maturity).some((v) => v !== 'none')
        if (!anyPicked) {
          return locale === 'nl'
            ? 'Kies minstens één mijlpaal voor we een Berkus-leg kunnen renderen.'
            : 'Pick at least one milestone so we can render a Berkus leg.'
        }
        return null
      }
      default:
        return null
    }
  }, [stepDef, companyName, stage, sector, country, maturity, locale])

  const goNext = () => {
    if (blocker) {
      if (stepDef) trackStudioStepBlocked(stepDef.id, blocker)
      return
    }
    if (stepDef) trackStudioStepCompleted(stepDef.id, stage)
    if (isLast && onComplete) {
      onComplete()
      return
    }
    onStepChange(Math.min(STUDIO_STEPS.length - 1, currentStep + 1))
  }
  const goBack = () => onStepChange(Math.max(0, currentStep - 1))

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/[0.02]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 lg:px-8">
        {/* Header */}
        <header className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            {locale === 'nl' ? 'Startup Waarderingsmotor' : 'Startup Valuation Studio'}
          </p>
          <h1 className="text-2xl font-semibold text-foreground lg:text-3xl">
            {stepDef?.label[locale] ?? ''}
          </h1>
        </header>

        {/* Progress */}
        <StepProgress
          steps={STUDIO_STEPS.map((step) => ({ label: step.label[locale] }))}
          currentStep={currentStep}
          showNumbers
          variant="primary"
          size="sm"
        />

        {/* Two-column layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {/* Step content */}
          <motion.main
            key={currentStep}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className="min-w-0"
          >
            <div className="space-y-5">{children}</div>

            {/* Step nav */}
            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <AuroraButton
                variant="ghost"
                size="md"
                disabled={isFirst}
                onClick={goBack}
                aria-label={locale === 'nl' ? 'Vorige stap' : 'Previous step'}
              >
                <ArrowLeft className="h-4 w-4" />
                {locale === 'nl' ? 'Vorige' : 'Back'}
              </AuroraButton>
              <div className="flex flex-col items-end gap-2">
                {blocker && (
                  <p
                    id="studio-shell-blocker"
                    role="status"
                    aria-live="polite"
                    className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400"
                  >
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                    {blocker}
                  </p>
                )}
                <AuroraButton
                  variant="primary"
                  size="lg"
                  onClick={goNext}
                  loading={isCompleting && isLast}
                  disabled={blocker != null || (isCompleting && isLast)}
                  aria-disabled={blocker != null}
                  aria-describedby={blocker ? 'studio-shell-blocker' : undefined}
                >
                  {isLast
                    ? locale === 'nl'
                      ? 'Genereer rapport'
                      : 'Generate report'
                    : locale === 'nl'
                      ? 'Volgende'
                      : 'Next'}
                  {!isLast && <ArrowRight className="h-4 w-4" />}
                </AuroraButton>
              </div>
            </div>
          </motion.main>

          {/* Live receipt */}
          <div className="hidden lg:block">
            <LiveReceipt
              valuation={valuation}
              benchmark={benchmark}
              isFallback={isFallback}
              publishedAt={publishedAt}
              locale={locale}
            />
          </div>

          {/* Mobile receipt — collapsible bottom sheet */}
          <details className="lg:hidden">
            <summary className="cursor-pointer rounded-xl border border-foreground/10 bg-background/80 px-4 py-3 text-sm font-medium text-foreground/80">
              {locale === 'nl' ? 'Live waardering tonen' : 'Show live valuation'}
            </summary>
            <div className="mt-3">
              <LiveReceipt
                valuation={valuation}
                benchmark={benchmark}
                isFallback={isFallback}
                publishedAt={publishedAt}
                locale={locale}
              />
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
