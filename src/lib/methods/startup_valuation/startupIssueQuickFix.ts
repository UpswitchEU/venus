import { getRegionalBaseline } from '@/components/calculator/sections/startup/regionalBaseline'
import type { StartupValuationStore } from '@/store/manual/startupValuationStoreTypes'
import {
  STARTUP_SECTOR_DEFAULT_Y5_REVENUE,
  STARTUP_SECTOR_EXIT_MULTIPLES,
  STARTUP_STAGE_DEFAULT_RAISE,
} from '@/store/manual/useStartupValuationStore'

type QuickFixLocale = 'en' | 'nl' | 'fr'

type StartupIssueQuickFixLabel = Record<QuickFixLocale, string>

const QUICK_FIX_LABELS: Record<string, StartupIssueQuickFixLabel> = {
  missing_investment_ask: {
    en: 'Use stage default',
    nl: 'Gebruik stage-default',
    fr: 'Utiliser la valeur par défaut de l\'étape',
  },
  no_exit_story: {
    en: 'Fill exit defaults',
    nl: 'Vul exit-defaults',
    fr: 'Remplir les valeurs par défaut de sortie',
  },
  thin_blend_for_stage: {
    en: 'Fill exit defaults',
    nl: 'Vul exit-defaults',
    fr: 'Remplir les valeurs par défaut de sortie',
  },
  recurring_sector_no_arr: {
    en: 'Mark pre-revenue',
    nl: 'Markeer pre-revenue',
    fr: 'Marquer comme pré-revenu',
  },
  target_roi_too_low: {
    en: 'Use stage ROI',
    nl: 'Gebruik stage-ROI',
    fr: 'Utiliser le retour sur investissement de l\'étape',
  },
  inception_bet_without_pedigree: {
    en: 'Use milestone lens',
    nl: 'Gebruik mijlpaal-lens',
    fr: 'Utiliser l\'objectif d\'étape',
  },
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function fillExitStoryDefaults(store: StartupValuationStore) {
  const sectorDefaultY5 = STARTUP_SECTOR_DEFAULT_Y5_REVENUE[store.sector] ?? 5_000_000
  const sectorDefaultMultiple =
    STARTUP_SECTOR_EXIT_MULTIPLES[store.sector] ??
    getRegionalBaseline(store.country_code, store.stage).comparable_exit_revenue_multiple
  const stageDefaultRoi = getRegionalBaseline(store.country_code, store.stage).default_target_roi_x

  if (!isPositiveNumber(store.year5_revenue_projection)) {
    store.setField('year5_revenue_projection', sectorDefaultY5)
  }
  if (!isPositiveNumber(store.exit_revenue_multiple)) {
    store.setField('exit_revenue_multiple', sectorDefaultMultiple)
  }
  if (!isPositiveNumber(store.target_roi_x) || store.target_roi_x < 5) {
    store.setField('target_roi_x', stageDefaultRoi)
  }
}

export function getStartupIssueQuickFixLabel(
  issueId: string,
  locale: QuickFixLocale
): string | undefined {
  return QUICK_FIX_LABELS[issueId]?.[locale]
}

export function applyStartupIssueQuickFix(issueId: string, store: StartupValuationStore): boolean {
  switch (issueId) {
    case 'missing_investment_ask':
      store.setField('investment_amount_sought', STARTUP_STAGE_DEFAULT_RAISE[store.stage])
      return true

    case 'no_exit_story':
    case 'thin_blend_for_stage':
      fillExitStoryDefaults(store)
      return true

    case 'recurring_sector_no_arr':
      store.setField('revenue_status', 'no')
      store.setField('mrr', null)
      store.setField('arr', null)
      store.setField('mrr_growth_rate_pct', null)
      store.setField('monthly_churn_pct', null)
      store.setField('cac', null)
      store.setField('ltv', null)
      return true

    case 'target_roi_too_low':
      store.setField(
        'target_roi_x',
        getRegionalBaseline(store.country_code, store.stage).default_target_roi_x
      )
      return true

    case 'inception_bet_without_pedigree':
      store.setField('inception_lens', 'milestones_driven')
      return true

    default:
      return false
  }
}
