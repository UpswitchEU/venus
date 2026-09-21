import { expect, test } from '@playwright/test'

test('manual company entry remains usable when registry search fails', async ({ page, isMobile }) => {
  const calculation: { submitted: Record<string, unknown> | null } = { submitted: null }
  let registryRequests = 0
  const baseUrl = String(test.info().project.use.baseURL)
  await page
    .context()
    .addCookies([
      { name: 'upswitch_access_token', value: 'local-e2e-proof', url: baseUrl, sameSite: 'Lax' },
    ])
  await page.route('**/api/**', (route) => route.fulfill({ json: { success: true, data: [] } }))
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          user: {
            id: 'manual-advisor',
            email: 'advisor@example.com',
            role: 'accountant',
          },
        },
      },
    })
  )
  await page.route('**/api/bootstrap', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          identity: {
            type: 'authenticated',
            userId: 'manual-advisor',
            email: 'advisor@example.com',
          },
          report: {
            mode: 'new',
            reportId: route.request().postDataJSON().reportId,
            hasExistingData: false,
            hasValuationResult: false,
            status: 'draft',
          },
          prefill: {
            sources: ['accounting_integration'],
            companyInfo: { companyName: 'Imported business', countryCode: 'BE' },
            financials: { revenue: 1500000, ebitda: 250000, employeeCount: 12 },
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
      },
    })
  )
  await page.route('**/business-types/**', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: route.request().url().includes('categories')
          ? []
          : {
              business_types: [
                {
                  id: 'accounting',
                  title: 'Accounting firm',
                  description: 'Accounting services',
                  category_id: 'services',
                  industry_mapping: 'services',
                  popular: true,
                  status: 'active',
                },
              ],
              has_more: false,
            },
      },
    })
  )
  await page.route('**/registry/**', (route) => {
    registryRequests += 1
    return route.fulfill({ status: 503, json: { error: 'Search unavailable' } })
  })
  await page.route('**/valuations/calculate', (route) => {
    calculation.submitted = route.request().postDataJSON()
    return route.fulfill({
      json: {
        success: true,
        data: {
          valuation_id: 'manual-calculation',
          equity_value_mid: 1250000,
          html_report: '<html><body>Manual company valuation</body></html>',
        },
      },
    })
  })
  await page.goto('/en/reports/new?flow=manual&source=mercury')
  const companyName = page.getByRole('textbox', { name: /company name/i }).first()
  await expect(companyName).toHaveValue('Imported business')
  await companyName.fill('Manual company without KBO')
  await expect.poll(() => registryRequests).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Continue without registry match', exact: true }).click()
  await expect(companyName).toHaveValue('Manual company without KBO')
  await expect(page.locator('#manual-business-type')).toBeVisible()
  await page.locator('#manual-business-type').getByRole('button').first().click()
  await page.getByText('Accounting firm', { exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Financial History', exact: true })).toBeVisible()
  const revenue = page.getByRole('textbox', { name: 'Revenue', exact: true }).first()
  await expect(revenue).toHaveValue('1.500.000')
  await expect(page.getByRole('textbox', { name: 'EBITDA', exact: true }).first()).toHaveValue(
    '250.000'
  )
  await revenue.fill('1600000')
  await revenue.blur()
  await expect(revenue).toHaveValue('1.600.000')
  await expect(page.getByRole('button', { name: 'Determine value', exact: true })).toBeEnabled()
  await expect(page.getByText(/registry match required|KBO.*required/i)).toHaveCount(0)
  await page.getByRole('button', { name: 'Determine value', exact: true }).click()
  await expect.poll(() => calculation.submitted).not.toBeNull()
  expect(calculation.submitted).toMatchObject({
    company_name: 'Manual company without KBO',
    current_year_data: { revenue: 1600000 },
  })
  expect(calculation.submitted?.kbo_number).toBeFalsy()
  const output = isMobile ? page.getByRole('dialog') : page
  await expect(output.getByText('Manual company valuation', { exact: true })).toBeVisible()
})
