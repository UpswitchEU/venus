import { z } from 'zod'

/**
 * Shadow-only Venus compatibility contract for company-graph maturity v3.
 *
 * Titan is the authority for every field in this object. Venus may retain and
 * transport a context received through an authenticated server projection, but
 * it must never construct one from a legacy card, URL, slug, workspace ID, or
 * local maturity inference. Titan must re-authorize the snapshot head and the
 * caller's current owner/advisor relationship on every write.
 */
export const CompanyGraphContextSchema = z
  .object({
    company_node_id: z.string().uuid(),
    graph_revision: z.string().regex(/^[0-9a-f]{64}$/),
    maturity_snapshot_id: z.string().uuid(),
    ruleset_version: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/),
    audience: z.enum(['owner', 'advisor']),
  })
  .strict()

export type CompanyGraphContext = z.infer<typeof CompanyGraphContextSchema>
export type CompanyGraphWorkspaceAudience = CompanyGraphContext['audience']

export class InvalidCompanyGraphContextError extends Error {
  constructor() {
    super('company_graph_context must be a current server-authorized owner or advisor context')
    this.name = 'InvalidCompanyGraphContextError'
  }
}

/** Fail-closed parser for data received from authenticated server projections. */
export function parseCompanyGraphContext(value: unknown): CompanyGraphContext | null {
  const result = CompanyGraphContextSchema.safeParse(value)
  return result.success ? (value as CompanyGraphContext) : null
}

/**
 * Validate an optional outbound context without normalizing or rebuilding it.
 * Returning the original reference makes accidental field rewriting observable
 * and preserves the exact server-issued wire artifact.
 */
export function assertOptionalCompanyGraphContext(value: unknown): CompanyGraphContext | undefined {
  if (value === undefined) return undefined
  const parsed = parseCompanyGraphContext(value)
  if (!parsed) throw new InvalidCompanyGraphContextError()
  return parsed
}

export function isCompanyGraphContextForAudience(
  context: CompanyGraphContext,
  audience: CompanyGraphWorkspaceAudience
): boolean {
  return context.audience === audience
}

export function companyGraphContextsMatch(
  left: CompanyGraphContext,
  right: CompanyGraphContext
): boolean {
  return (
    left.company_node_id === right.company_node_id &&
    left.graph_revision === right.graph_revision &&
    left.maturity_snapshot_id === right.maturity_snapshot_id &&
    left.ruleset_version === right.ruleset_version &&
    left.audience === right.audience
  )
}
