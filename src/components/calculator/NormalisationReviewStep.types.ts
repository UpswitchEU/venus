export type NormalizationType = 'add' | 'subtract' | 'add_percent' | 'subtract_percent' | 'absolute'

export type NormalizationSource =
  | 'manual'
  | 'yuki'
  | 'exact'
  | 'silverfin'
  | 'bizzcontrol'
  | 'odoo'
  | 'octopus'
  | 'accountable'
  | 'csv'
  | 'ai'
  | 'auto'

export interface SuggestedNormalisation {
  id: string
  code: string
  description: string
  category: 'salary' | 'rent' | 'vehicle' | 'one-time' | 'personal' | 'depreciation' | 'other'
  amount: number
  reason: string
  sourceRef?: string
  status: 'pending' | 'accepted' | 'rejected'
  source?: NormalizationSource
  type?: NormalizationType
  applyAllYears?: boolean
  marketBenchmark?: string
}

export interface NormalisationReviewStepProps {
  suggestions: SuggestedNormalisation[]
  originalEbitda: number
  companyName: string
  sourceIntegration?: 'yuki' | 'exact' | 'odoo' | 'octopus' | 'accountable' | 'manual'
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onAcceptAll: () => void
  onRejectAll: () => void
  onContinue: () => void
  onBack: () => void
  onUpdate?: (id: string, updates: Partial<SuggestedNormalisation>) => void
  onAdd?: (normalisation: Omit<SuggestedNormalisation, 'id' | 'status'>) => void
  onRemove?: (id: string) => void
}
