import {
  assertOptionalCompanyGraphContext,
  type CompanyGraphContext,
  InvalidCompanyGraphContextError,
} from '../types/companyGraphContext'
import { ValidationError } from '../types/errors'

/**
 * Outbound valuation/report boundary. This validates shape only; Titan remains
 * responsible for checking that the node, head snapshot, graph revision,
 * ruleset and caller authority are still current.
 */
export function validateOptionalValuationCompanyGraphContext(
  value: unknown
): CompanyGraphContext | undefined {
  try {
    return assertOptionalCompanyGraphContext(value)
  } catch (error) {
    if (!(error instanceof InvalidCompanyGraphContextError)) throw error
    throw new ValidationError(
      'The company graph context is invalid or is not an owner/advisor projection.',
      'company_graph_context',
      { code: 'INVALID_COMPANY_GRAPH_CONTEXT' }
    )
  }
}
