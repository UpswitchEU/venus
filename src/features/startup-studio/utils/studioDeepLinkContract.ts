import type { StartupSector, StartupStage } from '@/store/manual/useStartupValuationStore'

export type StudioDeepLinkStage = StartupStage
export type StudioDeepLinkSector = StartupSector

export const STARTUP_STUDIO_STAGES = [
  'pre_seed',
  'seed',
  'series_a',
] as const satisfies readonly StartupStage[]

export const STARTUP_STUDIO_SECTORS = [
  'saas',
  'marketplace',
  'fintech',
  'biotech_healthtech',
  'deeptech_ai',
  'vertical_ai',
  'consumer',
  'hardware',
  'other',
] as const satisfies readonly StartupSector[]

export interface StudioDeepLinkParams {
  /** Pretty company name, will be trimmed + 120-char clamped. */
  companyName?: string
  stage?: StudioDeepLinkStage
  sector?: StudioDeepLinkSector
  /** 2-letter ISO; will be uppercased. */
  country?: string
  /** Current monthly recurring revenue (EUR). */
  mrr?: number
  /** Current annual recurring revenue (EUR). */
  arr?: number
  /** Round size to raise (EUR). */
  raise?: number
  /** Founder's one-line pitch (240-char clamp). */
  pitch?: string
}

export function isStudioDeepLinkStage(value: unknown): value is StudioDeepLinkStage {
  return typeof value === 'string' && (STARTUP_STUDIO_STAGES as readonly string[]).includes(value)
}

export function isStudioDeepLinkSector(value: unknown): value is StudioDeepLinkSector {
  return typeof value === 'string' && (STARTUP_STUDIO_SECTORS as readonly string[]).includes(value)
}

export function normalizeStudioCountryCode(value: string | null | undefined): string | null {
  const country = value?.trim().toUpperCase()
  return country?.length === 2 ? country : null
}
