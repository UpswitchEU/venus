import { useEffect, useState } from 'react'
import { useClientContext } from '../../../stores/clientContext'

export interface UseManualAccountantContextResult {
  accountantDisplayName?: string
  clientContextId?: string
  clientContextName?: string
  ctxRelationshipId?: string
  isAccountantMode: boolean
}

export function useManualAccountantContext(): UseManualAccountantContextResult {
  const [isAccountantMode, setIsAccountantMode] = useState(false)
  const [clientContextName, setClientContextName] = useState<string | undefined>(undefined)
  const [clientContextId, setClientContextId] = useState<string | undefined>(undefined)
  const [accountantDisplayName, setAccountantDisplayName] = useState<string | undefined>(undefined)

  const ctxIsActingAsClient = useClientContext((s) => s.isActingAsClient)
  const ctxRelationshipId = useClientContext((s) => s.relationshipId)
  const ctxClient = useClientContext((s) => s.client)
  const ctxRelationshipCustomerName = useClientContext((s) => s.relationshipCustomerName)
  const ctxAccountant = useClientContext((s) => s.accountant)
  const clientFullName = ctxClient?.fullName
  const clientEmail = ctxClient?.email
  const accountantFullName = ctxAccountant?.fullName
  const accountantEmail = ctxAccountant?.email

  useEffect(() => {
    if (ctxIsActingAsClient && ctxRelationshipId) {
      setIsAccountantMode(true)
      setClientContextName(
        clientFullName || clientEmail || ctxRelationshipCustomerName || undefined
      )
      setClientContextId(ctxRelationshipId)
      if (ctxAccountant) {
        setAccountantDisplayName(accountantFullName || accountantEmail || undefined)
      }
    } else {
      setIsAccountantMode(false)
      setClientContextName(undefined)
      setClientContextId(undefined)
      setAccountantDisplayName(undefined)
    }
  }, [
    ctxIsActingAsClient,
    ctxRelationshipId,
    clientFullName,
    clientEmail,
    ctxRelationshipCustomerName,
    ctxAccountant,
    accountantFullName,
    accountantEmail,
  ])

  return {
    accountantDisplayName,
    clientContextId,
    clientContextName,
    ctxRelationshipId: ctxRelationshipId ?? undefined,
    isAccountantMode,
  }
}
