import { afterEach, describe, expect, it } from 'vitest'
import { useAdvisorControlsModalStore } from './useAdvisorControlsModalStore'

describe('useAdvisorControlsModalStore', () => {
  afterEach(() => {
    // Reset between tests since the store is a module-level singleton — a
    // leaky state would let one test's open=true leak into the next.
    useAdvisorControlsModalStore.setState({ open: false })
  })

  it('defaults to closed', () => {
    expect(useAdvisorControlsModalStore.getState().open).toBe(false)
  })

  it('setOpen flips the state', () => {
    useAdvisorControlsModalStore.getState().setOpen(true)
    expect(useAdvisorControlsModalStore.getState().open).toBe(true)
    useAdvisorControlsModalStore.getState().setOpen(false)
    expect(useAdvisorControlsModalStore.getState().open).toBe(false)
  })

  it('toggle inverts state — used by the wizard button when the same surface re-clicks', () => {
    useAdvisorControlsModalStore.getState().toggle()
    expect(useAdvisorControlsModalStore.getState().open).toBe(true)
    useAdvisorControlsModalStore.getState().toggle()
    expect(useAdvisorControlsModalStore.getState().open).toBe(false)
  })

  it('two consumers (wizard button + kebab) share the same atom', () => {
    // This is the whole point of the store — both surfaces observe the same
    // boolean. Subscribing twice and dispatching once must wake both.
    const seen: boolean[] = []
    const unsub1 = useAdvisorControlsModalStore.subscribe((state) => {
      seen.push(state.open)
    })
    const unsub2 = useAdvisorControlsModalStore.subscribe((state) => {
      seen.push(state.open)
    })
    useAdvisorControlsModalStore.getState().setOpen(true)
    unsub1()
    unsub2()
    // Both subscribers received the open=true notification.
    expect(seen.filter((v) => v === true).length).toBe(2)
  })
})
