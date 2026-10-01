import { describe, expect, it, vi } from 'vitest'
import { installWorkspaceHistory } from '../workspaceHistory'

function browserHistory() {
  const browser = new EventTarget() as EventTarget & { top: unknown; history: unknown }
  const entries: { state: Record<string, unknown>; url: string }[] = [
    { state: { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ['root'] }, url: '/' },
  ]
  let index = 0
  const history = {
    get state() {
      return entries[index].state
    },
    get length() {
      return entries.length
    },
    pushState(state: Record<string, unknown>, _unused: string, url: string) {
      entries.splice(++index, entries.length, { state, url })
    },
    replaceState(state: Record<string, unknown>, _unused: string, url?: string) {
      entries[index] = { state, url: url || entries[index].url }
    },
    go(delta: number) {
      queueMicrotask(() => {
        const next = index + delta
        if (next < 0 || next >= entries.length || next === index) return
        index = next
        const event = new Event('popstate')
        Object.defineProperty(event, 'state', { value: entries[index].state })
        browser.dispatchEvent(event)
      })
    },
  }
  browser.history = history
  browser.top = browser
  const untrackedPush = history.pushState.bind(history)
  const controller = installWorkspaceHistory(browser as unknown as Window)
  if (!controller) throw new Error('Expected top-level history controller')
  const nextRouter = vi.fn()
  browser.addEventListener('popstate', nextRouter)
  const push = (url: string) => history.pushState({ ...history.state }, '', url)
  return {
    browser,
    controller,
    history,
    nextRouter,
    push,
    untrackedPush,
    url: () => entries[index].url,
  }
}

async function settle() {
  for (let count = 0; count < 15; count += 1) await Promise.resolve()
}

describe('workspace native history', () => {
  it('keeps the workspace mounted until save confirms, without adding history entries', async () => {
    const b = browserHistory()
    b.push('/reports/a')
    b.push('/reports/b')
    let resume!: () => void
    const save = vi.fn(async (next: () => void) => {
      resume = next
    })
    b.controller.register(save)
    b.history.go(-1)
    await settle()
    expect(b.url()).toBe('/reports/b')
    expect(b.nextRouter).not.toHaveBeenCalled()
    expect(save).toHaveBeenCalledOnce()
    expect(b.history.length).toBe(3)
    resume()
    await settle()
    expect(b.url()).toBe('/reports/a')
    expect(b.nextRouter).toHaveBeenCalledOnce()
    expect(b.history.state).toMatchObject({
      __NA: true,
      __PRIVATE_NEXTJS_INTERNALS_TREE: ['root'],
    })
  })

  it('keeps a failed save open and permits its explicit Retry', async () => {
    const b = browserHistory()
    b.push('/reports/a')
    let retry!: () => void
    b.controller.register(async (resume) => {
      retry = resume
      throw new Error('offline')
    })
    b.history.go(-1)
    await settle()
    expect(b.url()).toBe('/reports/a')
    expect(b.nextRouter).not.toHaveBeenCalled()
    retry()
    await settle()
    expect(b.url()).toBe('/')
    expect(b.history.length).toBe(2)
  })

  it('protects Forward and a multi-entry history jump', async () => {
    const b = browserHistory()
    b.push('/reports/a')
    b.push('/reports/b')
    b.history.go(-1)
    await settle()
    const save = vi.fn(async (resume: () => void) => resume())
    b.controller.register(save)
    b.history.go(1)
    await settle()
    expect(b.url()).toBe('/reports/b')
    b.history.go(-2)
    await settle()
    expect(b.url()).toBe('/')
    expect(save).toHaveBeenCalledTimes(2)
    expect(b.nextRouter).toHaveBeenCalledTimes(3)
  })

  it('coalesces repeated Back while a save is pending', async () => {
    const b = browserHistory()
    b.push('/reports/a')
    b.push('/reports/b')
    let resume!: () => void
    let finish!: () => void
    const save = vi.fn((next: () => void) => {
      resume = next
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    })
    b.controller.register(save)
    b.history.go(-1)
    await settle()
    b.history.go(-1)
    await settle()
    expect(b.url()).toBe('/reports/b')
    expect(save).toHaveBeenCalledOnce()
    expect(b.nextRouter).not.toHaveBeenCalled()
    resume()
    finish()
    await settle()
    expect(b.url()).toBe('/reports/a')
    expect(b.nextRouter).toHaveBeenCalledOnce()
  })

  it.each([
    'push',
    'unmount',
    'new workspace',
    'new traversal',
  ])('invalidates an old Retry after %s', async (change) => {
    const b = browserHistory()
    b.push('/reports/a')
    let retry!: () => void
    const unregister = b.controller.register(async (resume) => {
      retry = resume
    })
    b.history.go(-1)
    await settle()
    const oldRetry = retry
    if (change === 'push') b.push('/reports/b')
    if (change === 'unmount') unregister()
    if (change === 'new workspace') b.controller.register(async () => undefined)
    if (change === 'new traversal') b.history.go(-1)
    await settle()
    const url = b.url()
    oldRetry()
    await settle()
    expect(b.url()).toBe(url)
    expect(b.nextRouter).not.toHaveBeenCalled()
  })

  it('preserves routing metadata and index during report identity replacement', async () => {
    const b = browserHistory()
    b.push('/reports/draft')
    const original = b.history.state
    b.history.replaceState({ ...original, tree: 'promoted' }, '', '/reports/saved?version=2')
    expect(b.history.state).toMatchObject(original)
    const save = vi.fn(async (resume: () => void) => resume())
    b.controller.register(save)
    b.history.go(-1)
    await settle()
    b.history.go(1)
    await settle()
    expect(b.url()).toBe('/reports/saved?version=2')
    expect(b.history.state).toMatchObject({ tree: 'promoted', __NA: true })
    expect(b.history.length).toBe(2)
  })

  it('installs once and excludes joint iframe history', () => {
    const b = browserHistory()
    expect(installWorkspaceHistory(b.browser as unknown as Window)).toBe(b.controller)
    b.browser.top = {}
    expect(installWorkspaceHistory(b.browser as unknown as Window)).toBeUndefined()
  })

  it('starts a fresh chain after an untracked entry instead of reusing incorrect offsets', async () => {
    const b = browserHistory()
    b.push('/reports/a')
    b.untrackedPush({ __NA: true }, '', '/legacy-entry')
    b.push('/reports/b')
    const save = vi.fn(async (resume: () => void) => resume())
    b.controller.register(save)
    b.history.go(-1)
    await settle()
    expect(b.url()).toBe('/legacy-entry')
    expect(save).not.toHaveBeenCalled()
    b.push('/reports/c')
    b.history.go(-1)
    await settle()
    expect(b.url()).toBe('/legacy-entry')
    expect(save).toHaveBeenCalledOnce()
  })
})
