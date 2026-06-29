import { showFullValuationMethodAccess } from '../../../constants/accountantPlanMethods'

export function shouldDefaultBasicInformationExpertMode({
  isAccountantForClient,
  planType,
  userRole,
}: {
  isAccountantForClient: boolean
  planType: string | null | undefined
  userRole: string | null | undefined
}): boolean {
  return showFullValuationMethodAccess({
    isAccountantForClient,
    planType,
    userRole,
  })
}
