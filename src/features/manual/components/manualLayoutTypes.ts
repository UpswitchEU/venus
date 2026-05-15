import type { ValuationResponse } from '@/types/valuation'
import type { ManualGuidedNormalizationUrl } from '../utils/manualGuidedNormalization'

export interface ManualLayoutProps {
  reportId: string
  onComplete: (result: ValuationResponse) => void
  initialVersion?: number
  initialMode?: 'edit' | 'view'
  initialTab?: 'preview' | 'history'
  urlAction?: string
  /** Open chat drawer on mount when URL has drawer=open (Clarity parity) */
  initialDrawerOpen?: boolean
  /** One-shot assistant intent forwarded from Mercury. */
  initialAgentNext?: string
  /**
   * Mercury STP: `focusField` + optional `flagYear` open the normalization modal once with
   * a ledger search hint (`spotlight` is ignored; kept for URL compatibility).
   */
  guidedResolutionUrl?: ManualGuidedNormalizationUrl
  /**
   * Optional `selected_method` query param (e.g. Mercury -> Venus). Seeds the top-bar method
   * when session has no stored preference yet and there is no valuation result.
   */
  initialSelectedMethodFromUrl?: string
}
