import assert from 'node:assert/strict'
export async function verifyNativeHistory(type, { baseUrl, executablePath }) {
  const name = type.name()
  const options = executablePath ? { executablePath } : {}
  const browser = await type.launch({ headless: true, ...options })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === baseUrl ? route.continue() : route.abort(),
  )
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const api = async (body) => {
    const r = await page.request.post(baseUrl + '/api/reports', { data: body })
    assert.equal(r.status(), 200)
  }
  const saved = async (id) => (await page.request.get(baseUrl + '/api/reports?id=' + id)).json()
  const at = async (id) => {
    await page.getByRole('heading', { name: 'Report ' + id, exact: true }).waitFor()
    await page.getByRole('textbox', { name: 'Company' }).waitFor()
  }
  const editAndGo = async (value, delta) =>
    page.evaluate(
      async ({ value, delta }) => {
        const input = document.querySelector('input')
        input.focus()
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 0))
        history.go(delta)
      },
      { value, delta },
    )
  try {
    await api({ reset: true })
    await page.goto(baseUrl)
    await page.getByRole('link', { name: 'Open report A' }).click()
    await at('A')
    await page.getByRole('button', { name: 'Open report B' }).click()
    await at('B')
    const initialLength = await page.evaluate(() => history.length)
    await api({ delay: 900 })
    await editAndGo('Saved before Back', -1)
    await page.getByText('Saving before leaving…', { exact: true }).waitFor({ timeout: 8000 })
    assert.equal(new URL(page.url()).pathname, '/reports/b')
    await at('A')
    assert.equal((await saved('b')).company_name, 'Saved before Back')
    assert.equal(await page.evaluate(() => history.length), initialLength)
    console.log(name + ': immediate edit → Back saved before leaving, no extra entries')
    await api({ delay: 0 })
    await editAndGo('Saved before Forward', 1)
    await at('B')
    assert.equal((await saved('a')).company_name, 'Saved before Forward')
    assert.equal(
      await page.getByRole('textbox', { name: 'Company' }).inputValue(),
      'Saved before Back',
    )
    console.log(name + ': Forward saved A and restored B')
    await api({ failure: true })
    await editAndGo('Keep failed edit', -1)
    await page.getByRole('button', { name: 'Try again', exact: true }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/reports/b')
    assert.equal(
      await page.getByRole('textbox', { name: 'Company' }).inputValue(),
      'Keep failed edit',
    )
    assert.equal((await saved('b')).company_name, 'Saved before Back')
    assert.equal(
      await page
        .getByRole('textbox', { name: 'Company' })
        .evaluate((el) => el === document.activeElement),
      true,
    )
    await api({ failure: false })
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await at('A')
    assert.equal((await saved('b')).company_name, 'Keep failed edit')
    console.log(name + ': failed save kept B open; Retry saved and resumed intended Back')
    await page.evaluate(() => history.forward())
    await at('B')
    await api({ delay: 900 })
    await editAndGo('Latest pending edit', -1)
    await page.waitForTimeout(50)
    await page.evaluate(() => history.back())
    await at('A')
    assert.equal((await saved('b')).company_name, 'Latest pending edit')
    assert.equal(await page.evaluate(() => history.length), initialLength)
    console.log(name + ': repeated Back coalesced while saving')
    await api({ delay: 0 })
    await page.evaluate(() => history.forward())
    await at('B')
    await editAndGo('Multi-entry jump', -2)
    await page.getByRole('heading', { name: 'Local router fixture' }).waitFor()
    assert.equal((await saved('b')).company_name, 'Multi-entry jump')
    assert.deepEqual(errors, [])
    console.log(name + ': multi-entry jump saved, zero page errors')
  } finally {
    await browser.close()
  }
}
