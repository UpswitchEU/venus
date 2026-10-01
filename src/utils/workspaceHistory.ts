type SaveBeforeTraversal = (resume: () => void) => Promise<void>
type Position = { chain: string; index: number }
type Owner = { save: SaveBeforeTraversal }
type Traversal = {
  owner: Owner
  revision: number
  from: Position
  to: Position
  started: boolean
  approved: boolean
  resuming: boolean
}

const POSITION_KEY = '__venusWorkspaceHistory'
const controllers = new WeakMap<Window, ReturnType<typeof createWorkspaceHistory>>()

function positionOf(state: unknown): Position | undefined {
  const value = (state as Record<string, unknown> | null)?.[POSITION_KEY] as Position | undefined
  return value && typeof value.chain === 'string' && Number.isSafeInteger(value.index)
    ? value
    : undefined
}

/**
 * Index app-owned entries without adding dummy entries or storing report data.
 * Install at the root, before users enter a report. Next's history state is
 * preserved verbatim; only our position is added to push/replace operations.
 */
function createWorkspaceHistory(browser: Window) {
  const history = browser.history
  let position = positionOf(history.state) ?? { chain: crypto.randomUUID(), index: 0 }
  let owner: Owner | undefined
  let traversal: Traversal | undefined
  let revision = 0
  const push = history.pushState.bind(history)
  const replace = history.replaceState.bind(history)
  const withPosition = (data: unknown, next: Position) => ({
    ...(data && typeof data === 'object' ? data : {}),
    [POSITION_KEY]: next,
  })
  replace(withPosition(history.state, position), '')
  history.pushState = (data, unused, url) => {
    const next = { ...position, index: position.index + 1 }
    push(withPosition(data, next), unused, url)
    position = next
    revision += 1
    traversal = undefined
  }
  history.replaceState = (data, unused, url) => {
    replace(withPosition(data, position), unused, url)
  }

  const proceed = (attempt: Traversal) => {
    if (owner !== attempt.owner || revision !== attempt.revision) return
    attempt.approved = true
    traversal = attempt
    if (positionOf(history.state)?.index === attempt.from.index) {
      attempt.resuming = true
      history.go(attempt.to.index - attempt.from.index)
    }
  }
  const restored = (attempt: Traversal) => {
    if (attempt.approved) {
      proceed(attempt)
    } else if (!attempt.started) {
      attempt.started = true
      // The workspace guard owns failures, timeout and localized Retry. Keep
      // its resume callback valid after failure, until another navigation or
      // workspace registration invalidates this attempt.
      const settled = () => {
        if (traversal === attempt && !attempt.approved) traversal = undefined
      }
      void attempt.owner.save(() => proceed(attempt)).then(settled, settled)
    }
  }
  browser.addEventListener(
    'popstate',
    (event) => {
      const target = positionOf(event.state)
      if (!target || target.chain !== position.chain) {
        // Entries outside this indexed app chain cannot be safely replayed.
        // Full-document exits remain covered by the form's beforeunload guard.
        // Start a fresh chain so subsequent app links never use stale offsets
        // across an untracked entry (for example, a native fragment link).
        revision += 1
        traversal = undefined
        position = { chain: crypto.randomUUID(), index: 0 }
        replace(withPosition(event.state, position), '')
        return
      }
      if (traversal?.resuming && target.index === traversal.to.index) {
        position = target
        traversal = undefined
        revision += 1
        return
      }
      if (!traversal && (!owner || target.index === position.index)) {
        position = target
        revision += 1
        return
      }
      // popstate occurs after the URL changes. Restore the originating entry
      // before Next sees it, leaving the form mounted while its save settles.
      const activeOwner = traversal?.owner ?? owner
      if (!activeOwner) return
      event.stopImmediatePropagation()
      const attempt = traversal ?? {
        owner: activeOwner,
        revision: ++revision,
        from: position,
        to: target,
        started: false,
        approved: false,
        resuming: false,
      }
      traversal = attempt
      attempt.resuming = false
      if (target.index !== attempt.from.index) {
        history.go(attempt.from.index - target.index)
      } else {
        restored(attempt)
      }
    },
    { capture: true }
  )
  return {
    register(save: SaveBeforeTraversal) {
      const registration = { save }
      owner = registration
      traversal = undefined
      revision += 1
      return () => {
        if (owner !== registration) return
        owner = undefined
        traversal = undefined
        revision += 1
      }
    },
  }
}

export function installWorkspaceHistory(browser: Window = window) {
  // An embedded workspace shares the parent's joint session history. Its
  // Mercury handoff is guarded separately; local indexes cannot measure it.
  if (browser.top !== browser) return undefined
  let controller = controllers.get(browser)
  if (!controller) {
    controller = createWorkspaceHistory(browser)
    controllers.set(browser, controller)
  }
  return controller
}
