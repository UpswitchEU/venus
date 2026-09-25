import { toast } from 'sonner'
import { ContextBar } from '../../../components/calculator'

export interface ManualLayoutContextBarProps {
  businessName?: string
  clientContextId?: string | null
  clientContextName?: string
  draftStatus: 'draft' | 'saved' | 'saving' | 'unsaved'
  isAccountantMode: boolean
  lastSaved?: Date
  onOpenMercuryClientForInvite: () => void
  /** Not shown here any more: the nav's Normalizations badge is the one home for the count. */
  onShowNormalisationReview?: () => void
  pendingNormalizationCount?: number
  translate: (key: string) => string
}

export function ManualLayoutContextBar({
  businessName,
  clientContextId,
  clientContextName,
  draftStatus,
  isAccountantMode,
  lastSaved,
  onOpenMercuryClientForInvite,
  translate,
}: ManualLayoutContextBarProps) {
  if (!isAccountantMode || (!clientContextName && !businessName)) return null

  return (
    <ContextBar
      clientName={clientContextName?.split(' ')[0]}
      businessName={businessName}
      draftStatus={draftStatus}
      lastSaved={lastSaved}
      onClientClick={() => {
        if (clientContextId) {
          onOpenMercuryClientForInvite()
        }
      }}
      onBusinessClick={clientContextId ? onOpenMercuryClientForInvite : undefined}
      clientApprovalStatus="none"
      onResendApproval={() => toast.info(translate('reminderSent'))}
    />
  )
}
