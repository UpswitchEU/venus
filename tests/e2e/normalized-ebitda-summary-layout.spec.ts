import { expect, test } from '@playwright/test'

const CARD_WIDTHS = [280, 360, 735, 736] as const

function cardMarkup(width: number) {
  return `
    <main style="width: ${width}px">
      <section
        data-testid="normalized-ebitda-summary"
        class="@container relative max-w-full overflow-hidden rounded-xl transition-shadow duration-300 motion-reduce:transition-none"
      >
        <div class="relative m-[1px] max-w-full rounded-[11px] bg-background p-4">
          <div class="relative max-w-full min-w-0">
            <div
              data-testid="summary-layout"
              class="flex max-w-full min-w-0 flex-col gap-3 @[46rem]:flex-row @[46rem]:flex-wrap @[46rem]:items-center @[46rem]:justify-between"
            >
              <div class="max-w-full min-w-0">
                <p class="text-xs font-medium text-foreground/60 mb-1">Genormaliseerde EBITDA</p>
                <div class="flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span class="shrink-0 whitespace-nowrap text-2xl font-bold text-foreground font-mono tabular-nums tracking-tight">€ 283.074</span>
                  <span class="shrink-0 whitespace-nowrap text-xs text-foreground/50">(5 jaren)</span>
                  <span class="basis-full text-sm font-medium text-success @[22rem]:basis-auto">+€ 92.965</span>
                </div>
              </div>
              <div
                data-testid="summary-actions"
                class="flex max-w-full min-w-0 flex-col items-stretch gap-2 @[46rem]:shrink-0 @[46rem]:flex-row @[46rem]:items-center"
              >
                <button
                  type="button"
                  class="inline-flex min-h-11 min-w-0 items-center self-start text-left text-xs font-medium leading-snug text-foreground/60 underline decoration-foreground/20 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/40 @[46rem]:whitespace-nowrap"
                >2 normalisaties / 1 latentie</button>
                <button
                  type="button"
                  class="min-h-11 w-full shrink-0 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors @[46rem]:w-auto bg-background border border-foreground/10 text-foreground hover:bg-foreground/[0.02]"
                >Aanpassingen bekijken</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  `
}

test.describe('Normalized EBITDA summary layout', () => {
  test.beforeEach(async ({ page }) => {
    // Load the real application stylesheet so this test exercises generated
    // Tailwind container-query rules in an actual browser.
    await page.goto('/nl/reports/new', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.styleSheets.length > 0)
  })

  for (const width of CARD_WIDTHS) {
    test(`keeps the populated card inside a ${width}px rail`, async ({ page }) => {
      await page.evaluate((card) => {
        document.body.innerHTML = card
      }, cardMarkup(width))

      const card = page.getByTestId('normalized-ebitda-summary')
      const layout = page.getByTestId('summary-layout')
      const actions = page.getByTestId('summary-actions')
      const buttons = actions.getByRole('button')

      await expect(card).toBeVisible()
      await expect(buttons).toHaveCount(2)

      const metrics = await card.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }))
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)

      const expectedDirection = width < 736 ? 'column' : 'row'
      await expect(layout).toHaveCSS('flex-direction', expectedDirection)
      await expect(actions).toHaveCSS('flex-direction', expectedDirection)

      for (const button of await buttons.all()) {
        const box = await button.boundingBox()
        expect(box?.height).toBeGreaterThanOrEqual(44)
      }
    })
  }
})
