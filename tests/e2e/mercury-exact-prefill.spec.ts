import { expect, test } from '@playwright/test'

test.describe('Mercury Exact prefill', () => {
  test('prefills the manual flow from synced Exact data without calling Exact batch import', async ({
    page,
  }) => {
    let exactBatchRequests = 0

    await page.route('**/integrations/accounting/exact/financial-data/batch**', async (route) => {
      exactBatchRequests += 1
      await route.abort()
    })

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              id: 'user_exact_prefill',
              email: 'accountant@example.com',
              role: 'accountant',
            },
          },
        }),
      })
    })

    await page.route('**/api/bootstrap', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            identity: {
              type: 'authenticated',
              userId: 'user_exact_prefill',
              email: 'accountant@example.com',
            },
            report: {
              mode: 'new',
              reportId: 'val_exact_prefill_e2e',
              hasExistingData: false,
              hasValuationResult: false,
              status: 'draft',
            },
            prefill: {
              sources: ['accounting_integration'],
              companyInfo: {
                companyName: 'Exact Sync BV',
                countryCode: 'BE',
              },
              financials: {
                revenue: 1_500_000,
                ebitda: 250_000,
                employeeCount: 12,
                importedLedgerAnalysis: {
                  latest_fiscal_year: 2024,
                  sde_flags: [
                    {
                      ledger_code: '620000',
                      ledger_name: 'Related party rent',
                      amount: 12_000,
                      deviation_pct: 0.18,
                      benchmark_median_pct: 0.04,
                      benchmark_std_pct: 0.03,
                      actual_pct_of_revenue: 0.08,
                      z_score: 2.1,
                      confidence: 0.81,
                      year: 2024,
                      potential_sde_addback: true,
                      suggested_question: "Is this rent at arm's length?",
                      rationale: 'Rent appears elevated versus peers.',
                      category: 'related_party_rent',
                    },
                  ],
                  ev_equity_bridge: {
                    enterprise_value: 900_000,
                    cash_and_equivalents: 120_000,
                    long_term_debt: 80_000,
                    short_term_financial_debt: 20_000,
                    interest_bearing_debt: 100_000,
                    net_debt: -20_000,
                    equity_value: 920_000,
                  },
                  dcf_defaults: {
                    average_depreciation: 40_000,
                    suggested_capex: 45_000,
                  },
                },
              },
              confidence: 0.95,
              fieldsPopulated: ['company_name', 'country_code', 'revenue', 'ebitda'],
              fieldsRemaining: [],
              readOnlyKbo: false,
              autoAdvancePastPrefilledSteps: false,
            },
            ui: {
              showWelcomeBack: false,
              resumableSession: false,
              suggestedFlow: 'manual',
              prefilledFieldCount: 4,
              totalFieldCount: 4,
              showKboVerification: false,
              showAccountantBanner: false,
              sourceApp: 'mercury',
            },
          },
          bootstrapDurationMs: 12,
        }),
      })
    })

    await page.goto('/en/reports/new?flow=manual&source=mercury')

    await expect(page.locator('input[name="company_name"]')).toHaveValue('Exact Sync BV')
    await expect(page.locator('input[name="revenue"]')).toHaveValue(/1.?500.?000|1500000/)
    await expect(page.locator('input[name="ebitda"]')).toHaveValue(/250.?000|250000/)

    expect(exactBatchRequests).toBe(0)
  })
})
