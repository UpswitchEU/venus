const state = (globalThis.__routerFixtureState ??= {
  reports: {},
  failure: false,
  delay: 0,
  writes: [],
})
export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id')
  return Response.json(
    id
      ? (state.reports[id] ?? {
          company_name: 'Company ' + id.toUpperCase(),
          revenue: 100000,
          ebitda: 20000,
        })
      : state,
  )
}
export async function POST(request) {
  const body = await request.json()
  if ('failure' in body) state.failure = body.failure
  if ('delay' in body) state.delay = body.delay
  if (body.reset) {
    state.reports = {}
    state.writes = []
    state.failure = false
    state.delay = 0
  }
  if (body.id) {
    await new Promise((resolve) => setTimeout(resolve, state.delay))
    if (state.failure) return Response.json({ error: 'Simulated offline' }, { status: 503 })
    state.reports[body.id] = body.data
    state.writes.push({ id: body.id, data: body.data })
  }
  return Response.json({ ok: true })
}
