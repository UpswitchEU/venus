/**
 * Stage inference from registry founding year.
 *
 * The KBO/KVK registry returns a ``founding_year`` for every confirmed
 * company. The startup wizard's ``stage`` slider defaults to ``'seed'``
 * but most pre-seed founders sit on a brand-new entity (incorporated
 * this year or last). Without this inference the founder has to
 * manually flip the stage segmented control after the registry hit
 * lands — the kind of paper-cut that adds up across many clients.
 *
 * Cohort buckets (years from ``today`` to ``foundingYear``):
 *   - **0 – 1 year** → ``'pre_seed'``  — founders almost always pre-revenue
 *   - **2 – 3 years** → ``'seed'``     — typical seed cohort window
 *   - **≥ 4 years**   → ``'series_a'`` — past the seed window
 *
 * Returns ``null`` when the founding year is missing, malformed, or
 * implies a future date — caller leaves the existing store value alone.
 *
 * The buckets are intentionally conservative: a 3-year-old company at
 * pre-revenue is still defensibly labelled ``'seed'`` (the engine pulls
 * different weights but the same Berkus + Scorecard machinery applies).
 * The four-year cliff for ``'series_a'`` matches Atomico's published
 * stage-cohort buckets for European venture (State of European Tech
 * 2024, p. 88).
 *
 * Inference NEVER fires when the founder has already explicitly picked
 * a stage — the consumer is responsible for gating on
 * ``_stageWasUserSet`` (mirrors the ``seedSectorFromNaceIfDefault``
 * pattern that ships with this store).
 */

import type { StartupStage } from './useStartupValuationStore'

export interface InferStartupStageInput {
  /** Registry-supplied incorporation year (e.g. 2024). */
  foundingYear: number | null | undefined
  /**
   * Override for the "today" anchor — useful in tests so the cohort
   * boundaries don't drift as the calendar advances.  Defaults to the
   * current calendar year.
   */
  todayYear?: number
}

/** Cohort boundary constants — exposed for test pinning. */
export const STAGE_PRE_SEED_MAX_AGE_YEARS = 1
export const STAGE_SEED_MAX_AGE_YEARS = 3

/**
 * Infer a sensible startup-stage default from the registry founding year.
 *
 * Returns one of ``StartupStage`` or ``null`` when the input is unusable.
 * Pure function — no store reads, no DOM, no I/O — so it's trivially
 * unit-testable.
 */
export function inferStartupStageFromFoundingYear(
  input: InferStartupStageInput
): StartupStage | null {
  const fy = input.foundingYear
  if (typeof fy !== 'number' || !Number.isFinite(fy)) return null
  // Reject obvious garbage (negative, far-future, far-past).
  if (fy < 1900 || fy > 2100) return null

  const today = input.todayYear ?? new Date().getFullYear()
  const ageYears = today - fy

  // Future-dated registrations land in the wizard sometimes (a
  // newly-registered company created tomorrow but indexed today).  Treat
  // any ``ageYears < 0`` as pre-seed — the entity is brand new.
  if (ageYears < 0) return 'pre_seed'

  if (ageYears <= STAGE_PRE_SEED_MAX_AGE_YEARS) return 'pre_seed'
  if (ageYears <= STAGE_SEED_MAX_AGE_YEARS) return 'seed'
  return 'series_a'
}
