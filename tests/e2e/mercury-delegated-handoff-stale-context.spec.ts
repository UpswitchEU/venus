import { expect, test } from '@playwright/test'

const REPORT_ID = 'dba236f5-31eb-4ab9-b995-e52c64dce70c'
const URL_CLIENT_ID = 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd'
const STALE_CLIENT_ID = '5c5bfc87-13f3-48c2-be7f-506e7f4748e7'
const ACCOUNTANT_ID = 'acc-advisor-001'
const CLIENT_USER_ID = 'client-user-001'

test.describe('Mercury delegated handoff with stale client context', () => {
  test('re-fetches client context and bootstraps with URL-matched relationship headers', async ({
    page,
  }) => {
    let getClientContextCalls = 0
    let bootstrapRelationshipId: string | null = null

    await page.addInitScript(
      ({ staleClientId, accountantId }) => {
        localStorage.setItem(
          'client-context',
          JSON.stringify({
            state: {
              isActingAsClient: true,
              accountant: {
                id: accountantId,
                email: 'advisor@firm.be',
                fullName: 'Advisor',
              },
              client: {
                id: staleClientId,
                email: 'stale@client.be',
                fullName: 'Stale Client',
                avatarUrl: null,
              },
              relationshipId: staleClientId,
              relationshipCustomerName: 'Stale Client',
              lastValidatedAt: Date.now(),
            },
            version: 0,
          })
        )
      },
      { staleClientId: STALE_CLIENT_ID, accountantId: ACCOUNTANT_ID }
    )

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              id: ACCOUNTANT_ID,
              email: 'advisor@firm.be',
              role: 'accountant',
            },
          },
        }),
      })
    })

    await page.route('**/api/v2/auth/get-client-context', async (route) => {
      getClientContextCalls += 1
      const body = route.request().postDataJSON() as { clientId?: string }
      expect(body.clientId).toBe(URL_CLIENT_ID)

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accountantUser: {
            id: ACCOUNTANT_ID,
            email: 'advisor@firm.be',
            full_name: 'Advisor',
          },
          clientUser: {
            id: CLIENT_USER_ID,
            email: 'client@firm.be',
            full_name: 'Target Client',
            avatar_url: null,
          },
          relationship: {
            id: URL_CLIENT_ID,
            customer_name: 'Target Client',
          },
        }),
      })
    })

    await page.route('**/api/bootstrap', async (route) => {
      bootstrapRelationshipId =
        route.request().headers()['x-relationship-id'] ??
        route.request().headers()['X-Relationship-Id'] ??
        null

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            identity: {
              type: 'accountant_for_client',
              userId: CLIENT_USER_ID,
              email: 'advisor@firm.be',
              clientContext: {
                clientUserId: CLIENT_USER_ID,
                clientEmail: 'client@firm.be',
                clientCompanyName: 'Target Client',
                accountantUserId: ACCOUNTANT_ID,
                accountantEmail: 'advisor@firm.be',
                relationshipId: URL_CLIENT_ID,
              },
            },
            report: {
              mode: 'existing',
              reportId: REPORT_ID,
              hasExistingData: false,
              hasValuationResult: false,
              status: 'active',
            },
            prefill: {
              sources: [],
              companyInfo: {
                companyName: 'Target Client',
                countryCode: 'BE',
              },
              financials: {
                revenue: 1_200_000,
                ebitda: 180_000,
              },
              confidence: 0.8,
              fieldsPopulated: ['company_name', 'revenue', 'ebitda'],
              fieldsRemaining: [],
            },
            ui: {
              showWelcomeBack: false,
              resumableSession: false,
              suggestedFlow: 'manual',
              prefilledFieldCount: 3,
              totalFieldCount: 3,
              showKboVerification: false,
              showAccountantBanner: true,
              sourceApp: 'mercury',
            },
          },
          bootstrapDurationMs: 18,
        }),
      })
    })

    await page.goto(
      `/nl/reports/${REPORT_ID}?flow=manual&mode=accountant&source=mercury&clientId=${URL_CLIENT_ID}`,
      { waitUntil: 'domcontentloaded', timeout: 90_000 }
    )

    await expect
      .poll(() => getClientContextCalls, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1)

    await expect
      .poll(() => bootstrapRelationshipId, { timeout: 15_000 })
      .toBe(URL_CLIENT_ID)

    await expect(page.getByText('Loading took too long')).toHaveCount(0)
    await expect(page.getByText('Failed to fetch client context')).toHaveCount(0)

    await expect(page.locator('input[name="company_name"]')).toHaveValue('Target Client', {
      timeout: 15_000,
    })
  })
})
