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
  // An unclaimed client is named after its company: "upswitch-test › upswitch-test"
  // says one thing twice, so the client crumb drops out when it repeats the company.
  const sameName =
    Boolean(clientContextName && businessName) &&
    clientContextName?.trim().toLowerCase() === businessName?.trim().toLowerCase()
  const clientCrumb = sameName ? undefined : clientContextName?.split(' ')[0]

  return (
    <ContextBar
      clientName={clientCrumb}
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
