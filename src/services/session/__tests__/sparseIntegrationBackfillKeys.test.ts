import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Contract: Hermes/integration blobs must stay in BASE_SPARSE_BACKFILL_KEYS so
 * backfillSparseSessionFromStoreSeed can recover them when GET returns a thin payload.
 */
const REQUIRED = [
  'number_of_employees',
  'employee_count',
  'business_description',
  'canonical_nace_code',
  'taxonomy',
  'subIndustry',
  '_import_quality',
  'import_quality',
  '_financial_data_source',
  '_imported_ledger_analysis',
  '_imported_saas_metrics',
  '_imported_saas_provenance',
  'filing_year_confirmed',
] as const

describe('BASE_SPARSE_BACKFILL_KEYS integration parity', () => {
  const base = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'SessionService.ts'),
    'utf8'
  )

  it.each(REQUIRED)('includes %s', (key) => {
    expect(base).toContain(`'${key}'`)
  })
})
