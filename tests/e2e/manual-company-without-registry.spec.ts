import { expect, test } from '@playwright/test'

test('synthetic company survives save recovery, refresh, history and PDF download', async ({
  page,
  isMobile,
}) => {
  const calculation: { submitted: Record<string, unknown> | null } = { submitted: null }
  const unhandledWrites: string[] = []
  let registryRequests = 0
  let calculations = 0
  let resultSaves = 0
  let hasResult = false
  let failResultSave = true
  let sessionKey = ''
  const reportId = 'a1a1a1a1-1111-4111-8111-111111111111'
  const form: Record<string, unknown> = {}
  let sessionName: string | undefined
  const versions: Record<string, unknown>[] = []
  const html = `<html><body><h1>Manual company valuation</h1><p>${'Synthetic saved report evidence. '.repeat(15)}</p></body></html>`
  const result = () => ({
    valuation_id: 'synthetic-engine-run',
    report_id: reportId,
    equity_value_min: 1000000,
    equity_value_mid: 1250000,
    equity_value_max: 1500000,
    html_report: html,
    pdf_status: 'ready',
    currency: 'EUR',
  })
  const session = () => ({
    reportId: hasResult ? reportId : sessionKey,
    session_key: sessionKey,
    name: sessionName,
    currentView: 'manual',
    dataSource: 'manual',
    session_data: form,
    createdAt: '2026-10-11T08:00:00Z',
    updatedAt: '2026-10-11T08:01:00Z',
    ...(hasResult ? { valuationResult: result(), htmlReport: html, reportReady: true } : {}),
  })
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue()
      : route.abort('blockedbyclient')
  )
  const baseUrl = String(test.info().project.use.baseURL)
  await page
    .context()
    .addCookies([
      { name: 'upswitch_access_token', value: 'local-e2e-proof', url: baseUrl, sameSite: 'Lax' },
    ])
  await page.route('**/api/**', (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { success: true, data: [] } })
    unhandledWrites.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return route.fulfill({ status: 501, json: { error: 'Unhandled audit mutation' } })
  })
  await page.route('**/api/normalization/**', (route) =>
    route.fulfill({ json: { success: true, data: [] } })
  )
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          user: {
            id: 'manual-advisor',
            email: 'advisor@example.com',
            role: 'accountant',
            plan_type: 'accountant_paid',
          },
        },
      },
    })
  )
  await page.route('**/api/bootstrap', (route) => {
    sessionKey ||= route.request().postDataJSON().reportId
    return route.fulfill({
      json: {
        success: true,
        data: {
          identity: {
            type: 'authenticated',
            userId: 'manual-advisor',
            email: 'advisor@example.com',
          },
          report: {
            mode: hasResult ? 'existing' : 'new',
            reportId: hasResult ? reportId : route.request().postDataJSON().reportId,
            hasExistingData: hasResult,
            hasValuationResult: hasResult,
            reportReady: hasResult,
            status: hasResult ? 'completed' : 'draft',
          },
          ...(hasResult
            ? {
                valuationPackage: {
                  htmlReport: html,
                  pricingRange: { min: 1000000, mid: 1250000, max: 1500000, currency: 'EUR' },
                  versions: { current: 1, total: 1 },
                  pdf: { status: 'ready', url: `/api/valuations/${reportId}/pdf/download` },
                  formData: form,
                },
              }
            : {}),
          prefill: hasResult
            ? { sources: [], confidence: 0, fieldsPopulated: [], fieldsRemaining: [] }
            : {
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
  })
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
  await page.route('**/credits/plan', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          id: 'audit-plan',
          plan_type: 'accountant_paid',
          credits_remaining: 100,
          allowed_methods: null,
          plan_features: {
            valuation_download: true,
            ebitda_normalization: true,
            version_control: true,
          },
        },
      },
    })
  )
  await page.route('**/valuations/calculate', (route) => {
    calculations++
    calculation.submitted = route.request().postDataJSON()
    return route.fulfill({ json: { success: true, data: result() } })
  })
  await page.route(/\/api\/(?:v2\/)?valuations\/sessions(?:\/[^/?]+)?$/, (route) => {
    if (route.request().method() !== 'GET') {
      const body = route.request().postDataJSON()
      sessionKey ||= body.session_key
      if (typeof body.name === "string") sessionName = body.name
      Object.assign(form, body.session_data ?? body.sessionData ?? {})
    }
    return route.fulfill({ json: { success: true, data: session() } })
  })
  await page.route('**/sessions/*/result', (route) => {
    resultSaves++
    if (failResultSave)
      return route.fulfill({ status: 503, json: { error: 'Synthetic save interruption' } })
    hasResult = true
    Object.assign(form, route.request().postDataJSON().sessionData ?? {})
    if (!versions.length)
      versions.push({
        id: 'audit-version-1',
        report_id: reportId,
        version_number: 1,
        version_label: 'Initial valuation',
        created_at: '2026-10-11T08:01:00Z',
        form_data: { ...form },
        valuation_result: result(),
        html_report: html,
      })
    return route.fulfill({
      json: { success: true, reportId, sessionKey, reportReady: true, session: session() },
    })
  })
  await page.route('**/sessions/*/versions**', (route) => {
    if (route.request().method() === 'POST') {
      const version = {
        ...route.request().postDataJSON(),
        id: `audit-version-${versions.length + 1}`,
        report_id: reportId,
        version_number: versions.length + 1,
        created_at: '2026-10-11T08:01:00Z',
      }
      versions.push(version)
      return route.fulfill({ json: { success: true, data: version } })
    }
    return route.fulfill({
      json: {
        success: true,
        data: { versions, total: versions.length, active_version: 1, has_more: false },
      },
    })
  })
  await page.route('**/reports/**', (route) =>
    new URL(route.request().url()).pathname.startsWith('/api/')
      ? hasResult
        ? route.fulfill({ json: { success: true, data: result() } })
        : route.fulfill({ status: 404, json: { transient: false, error: 'No saved report' } })
      : route.fallback()
  )
  await page.route('**/pdf', (route) =>
    route.fulfill({ json: { status: 'ready', pdfUrl: `/api/valuations/${reportId}/pdf/download` } })
  )
  await page.route('**/pdf/download**', (route) =>
    route.fulfill({
      contentType: 'application/pdf',
      body: Buffer.from('%PDF-1.4\n% Synthetic transport fixture\n%%EOF'),
    })
  )
  await page.goto('/en/reports/new?flow=manual&source=mercury')
  const companyName = page.getByRole('textbox', { name: /company name/i }).first()
  await expect(companyName).toHaveValue('Imported business', { timeout: 60_000 })
  await companyName.fill('Manual company without KBO')
  await expect.poll(() => registryRequests).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Continue without registry match', exact: true }).click()
  await expect(companyName).toHaveValue('Manual company without KBO')
  await expect(page.locator('#manual-business-type')).toBeVisible()
  await page.locator('#manual-business-type').getByRole('button').first().click()
  await page.getByText('Accounting firm', { exact: true }).first().click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Financials', exact: true })).toBeVisible()
  const revenue = page.getByRole('textbox', { name: 'Revenue', exact: true }).first()
  await expect(revenue).toHaveValue('1,500,000')
  await expect(page.getByRole('textbox', { name: 'EBITDA', exact: true }).first()).toHaveValue(
    '250,000'
  )
  await revenue.fill('1600000.42')
  await revenue.blur()
  await expect(revenue).toHaveValue('1,600,000.42')
  await expect.poll(() => form.revenue).toBe(1600000.42)
  await expect(page.getByText('Saving your changes…', { exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Calculate valuation', exact: true })).toBeEnabled()
  await expect(page.getByText(/registry match required|KBO.*required/i)).toHaveCount(0)
  await page.getByRole('button', { name: 'Calculate valuation', exact: true }).click()
  await expect.poll(() => calculation.submitted).not.toBeNull()
  expect(calculation.submitted).toMatchObject({
    company_name: 'Manual company without KBO',
    current_year_data: { revenue: 1600000.42 },
  })
  expect(calculation.submitted?.kbo_number).toBeFalsy()
  const output = isMobile ? page.getByRole('dialog') : page
  await expect(output.getByText('Manual company valuation', { exact: true })).toBeVisible()
  await expect.poll(() => resultSaves).toBeGreaterThan(0)
  expect(calculations).toBe(1)
  if (isMobile) await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /retry save/i })).toBeVisible()
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: /download.*pdf/i })).toBeDisabled()
  await page.keyboard.press('Escape')
  failResultSave = false
  await page.getByRole('button', { name: /retry save/i }).click()
  await expect.poll(() => hasResult).toBe(true)
  await expect(page.getByRole('button', { name: /retry save/i })).toHaveCount(0)
  expect(calculations).toBe(1)
  await expect(page).toHaveURL(new RegExp(reportId))
  await page.reload()
  await expect(companyName).toHaveValue('Manual company without KBO')
  await expect(revenue).toHaveValue('1,600,000.42')
  expect(calculations).toBe(1)
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  await page.getByRole('menuitem', { name: /version history/i }).click()
  if (isMobile) {
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
  }
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  const pdfAction = page.getByRole('menuitem', { name: /download.*pdf/i })
  await expect(pdfAction).toBeEnabled()
  const download = page.waitForEvent('download')
  await pdfAction.click()
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/)
  expect(versions).toHaveLength(1)
  expect(unhandledWrites).toEqual([])
  expect(calculations).toBe(1)
})
