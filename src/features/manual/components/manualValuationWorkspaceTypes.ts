import type { ValuationResponse } from '@/types/valuation'
import type { ManualGuidedNormalizationUrl } from '../utils/manualGuidedNormalization'

export interface ManualValuationWorkspaceProps {
  reportId: string
  onComplete: (result: ValuationResponse) => void
  accountantCustomerId?: string | null
  initialVersion?: number
  initialMode?: 'edit' | 'view'
  initialTab?: 'preview' | 'history'
  urlAction?: string
  /** Open chat drawer on mount when URL has drawer=open (Clarity parity) */
  initialDrawerOpen?: boolean
  /** One-shot assistant intent forwarded from Mercury. */
  initialAgentNext?: string
  /**
   * Mercury STP: `focusField` + optional `flagYear` prepare a normalization search hint
   * for the review CTA (`spotlight` is ignored; kept for URL compatibility).
   */
  guidedResolutionUrl?: ManualGuidedNormalizationUrl
  /**
   * Optional `selected_method` query param (e.g. Mercury -> Venus). Seeds the top-bar method
   * when session has no stored preference yet and there is no valuation result.
   */
  initialSelectedMethodFromUrl?: string
  /**
   * Optional `selected_methods` query param for blended Mercury -> Venus handoffs.
   * Comma-separated method keys; sanitized by the session sync hook.
   */
  initialSelectedMethodsFromUrl?: string
}

export type ManualLayoutProps = ManualValuationWorkspaceProps
