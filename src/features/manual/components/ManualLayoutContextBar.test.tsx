import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ManualLayoutContextBar } from './ManualLayoutContextBar'

const contextBar = vi.hoisted(() => vi.fn((_props: Record<string, unknown>) => null))

vi.mock('../../../components/calculator', () => ({
  ContextBar: (props: Record<string, unknown>) => contextBar(props),
}))

const baseProps = {
  clientContextId: 'client-1',
  draftStatus: 'saved' as const,
  isAccountantMode: true,
  onOpenMercuryClientForInvite: vi.fn(),
  translate: (key: string) => key,
}

describe('ManualLayoutContextBar', () => {
  it('does not repeat the company as the client crumb for an unclaimed client', () => {
    render(
      <ManualLayoutContextBar
        {...baseProps}
        businessName="upswitch-test"
        clientContextName="Upswitch-Test"
      />
    )
    expect(contextBar).toHaveBeenLastCalledWith(
      expect.objectContaining({ businessName: 'upswitch-test', clientName: undefined })
    )
  })

  it('keeps the client crumb when the client is a person', () => {
    render(
      <ManualLayoutContextBar
        {...baseProps}
        businessName="Bakkerij Peeters"
        clientContextName="Jan Peeters"
      />
    )
    expect(contextBar).toHaveBeenLastCalledWith(
      expect.objectContaining({ businessName: 'Bakkerij Peeters', clientName: 'Jan' })
    )
  })
})
