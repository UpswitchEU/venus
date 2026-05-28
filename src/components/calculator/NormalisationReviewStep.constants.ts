import { DEFAULT_LEDGER_ACCOUNTS } from '../../constants/grootboek'
import type {
  NormalizationSource,
  NormalizationType,
  SuggestedNormalisation,
} from './NormalisationReviewStep.types'

export const categoryLabelKeys: Record<SuggestedNormalisation['category'], string> = {
  salary: 'categories.salary',
  rent: 'categories.rent',
  vehicle: 'categories.vehicle',
  'one-time': 'categories.oneTime',
  personal: 'categories.personal',
  depreciation: 'categories.depreciation',
  other: 'categories.other',
}

export const categoryIcons: Record<SuggestedNormalisation['category'], string> = {
  salary: '👤',
  rent: '🏢',
  vehicle: '🚗',
  'one-time': '⚡',
  personal: '🏠',
  depreciation: '📉',
  other: '📋',
}

export const sourceLabels: Record<NormalizationSource, { labelKey: string; color: string }> = {
  manual: { labelKey: 'sources.manual', color: 'bg-foreground/10 text-foreground/70' },
  yuki: { labelKey: 'sources.yuki', color: 'bg-accent/10 text-accent' },
  exact: { labelKey: 'sources.exact', color: 'bg-info/10 text-info' },
  silverfin: { labelKey: 'sources.silverfin', color: 'bg-indigo-500/10 text-indigo-600' },
  bizzcontrol: { labelKey: 'sources.bizzcontrol', color: 'bg-cyan-500/10 text-cyan-600' },
  odoo: { labelKey: 'sources.odoo', color: 'bg-purple-500/10 text-purple-600' },
  octopus: { labelKey: 'sources.octopus', color: 'bg-blue-500/10 text-blue-600' },
  // Expert/M reuses the violet treatment of its sibling Adsolut palette and
  // a dedicated `sources.expertm` label so the normalisation chip surfaces
  // the upload origin distinctly from Octopus / Silverfin.
  expertm: { labelKey: 'sources.expertm', color: 'bg-violet-500/10 text-violet-600' },
  accountable: { labelKey: 'sources.accountable', color: 'bg-emerald-500/10 text-emerald-600' },
  csv: { labelKey: 'sources.csv', color: 'bg-warning/10 text-warning' },
  ai: { labelKey: 'aiSuggestion', color: 'bg-primary/10 text-primary' },
  auto: { labelKey: 'sources.auto', color: 'bg-success/10 text-success' },
}

export const typeOptions: {
  value: NormalizationType
  label: string
  tooltipKey: string
}[] = [
  { value: 'add', label: '+€', tooltipKey: 'typeAddAmount' },
  { value: 'subtract', label: '-€', tooltipKey: 'typeSubtractAmount' },
  { value: 'add_percent', label: '+%', tooltipKey: 'typeAddPercent' },
  { value: 'subtract_percent', label: '-%', tooltipKey: 'typeSubtractPercent' },
  { value: 'absolute', label: 'ABS', tooltipKey: 'typeSetTarget' },
]

export const defaultLedgerAccounts = DEFAULT_LEDGER_ACCOUNTS

export interface NormalizationPreset {
  id: string
  labelKey: string
  icon: string
  code: string
  descriptionKey: string
  category: SuggestedNormalisation['category']
  defaultAmount: number
  reasonKey: string
  marketBenchmark?: string
}

export const normalizationPresets: NormalizationPreset[] = [
  {
    id: 'owner-salary',
    labelKey: 'presets.ownerSalary',
    icon: '👤',
    code: '620',
    descriptionKey: 'presets.ownerSalaryDesc',
    category: 'salary',
    defaultAmount: 60000,
    reasonKey: 'presets.ownerSalaryReason',
    marketBenchmark: '€55K - €75K',
  },
  {
    id: 'family-salary',
    labelKey: 'presets.familySalary',
    icon: '👨‍👩‍👧',
    code: '620',
    descriptionKey: 'presets.familySalaryDesc',
    category: 'personal',
    defaultAmount: 35000,
    reasonKey: 'presets.familySalaryReason',
    marketBenchmark: '€25K - €40K',
  },
  {
    id: 'rent',
    labelKey: 'presets.rent',
    icon: '🏢',
    code: '610',
    descriptionKey: 'presets.rentDesc',
    category: 'rent',
    defaultAmount: 24000,
    reasonKey: 'presets.rentReason',
    marketBenchmark: '€150 - €250/m²',
  },
  {
    id: 'vehicle',
    labelKey: 'presets.vehicle',
    icon: '🚗',
    code: '614',
    descriptionKey: 'presets.vehicleDesc',
    category: 'vehicle',
    defaultAmount: 18000,
    reasonKey: 'presets.vehicleReason',
    marketBenchmark: '€12K - €24K/jaar',
  },
  {
    id: 'legal',
    labelKey: 'presets.legal',
    icon: '⚖️',
    code: '647',
    descriptionKey: 'presets.legalDesc',
    category: 'one-time',
    defaultAmount: 25000,
    reasonKey: 'presets.legalReason',
  },
  {
    id: 'advisory',
    labelKey: 'presets.advisory',
    icon: '📊',
    code: '613',
    descriptionKey: 'presets.advisoryDesc',
    category: 'one-time',
    defaultAmount: 15000,
    reasonKey: 'presets.advisoryReason',
  },
]
