/**
 * Smoke tests for Venus's `ChatAssistantDrawer`.
 *
 * Scope: pin the WIRING for the controlled component, NOT the
 * deep render logic (proposal-card branches are already covered by
 * `tool-results-parser` + `tool-card-response-parsers` unit tests).
 *
 * Tests:
 *   - Drawer hidden when `open === false`
 *   - Drawer rendered when `open === true` (title + close button)
 *   - User + assistant messages render
 *   - Typing in the textarea + clicking Send fires `onSendMessage`
 *     with the trimmed text
 *   - Empty / whitespace-only input does NOT fire `onSendMessage`
 *   - Close button fires `onOpenChange(false)`
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock heavy presentation deps so the drawer can mount fast in jsdom.
vi.mock('next-intl', () => ({
  useLocale: () => 'nl',
  useTranslations:
    (_ns?: string) =>
    (key: string) =>
      key,
}))

vi.mock('framer-motion', () => {
  const passThrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>
  const Motion = new Proxy(
    {},
    {
      get:
        (_t, key) =>
        ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => {
          const cleaned = Object.fromEntries(
            Object.entries(props).filter(
              ([k]) =>
                ![
                  'initial',
                  'animate',
                  'exit',
                  'transition',
                  'whileHover',
                  'whileTap',
                  'layoutId',
                  'drag',
                  'dragConstraints',
                ].includes(k),
            ),
          )
          const Tag = (key as string) === 'svg' ? 'svg' : 'div'
          return <Tag {...cleaned}>{children}</Tag>
        },
    },
  )
  return {
    motion: Motion,
    AnimatePresence: passThrough,
  }
})

vi.mock('@/design-system/components/motion', () => ({ springDefault: {} }))

vi.mock('@/hooks/useScrollLock', () => ({
  useScrollLock: () => {},
}))

vi.mock('@/lib/analytics', () => ({
  trackAIAssistantMessage: vi.fn(),
  trackAIAssistantOpen: vi.fn(),
}))

// Markdown rendering is heavy + not part of the smoke surface.
vi.mock('react-markdown', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div data-testid='md'>{children}</div>,
}))

vi.mock('remark-gfm', () => ({ default: {} }))

import { ChatAssistantDrawer } from './ChatAssistantDrawer'
import type { ChatMessage } from './ChatAssistantDrawer'

function makeUserMessage(content: string, id = `u-${content}`): ChatMessage {
  return {
    id,
    role: 'user',
    type: 'user',
    content,
    timestamp: new Date(),
  } as unknown as ChatMessage
}

function makeAssistantMessage(content: string, id = `a-${content}`): ChatMessage {
  return {
    id,
    role: 'assistant',
    type: 'ai',
    content,
    timestamp: new Date(),
  } as unknown as ChatMessage
}

let onSendMessage: ReturnType<typeof vi.fn>
let onOpenChange: ReturnType<typeof vi.fn>

beforeEach(() => {
  onSendMessage = vi.fn()
  onOpenChange = vi.fn()
  // jsdom doesn't implement scrollIntoView; the drawer uses it for
  // message-list auto-scroll on render.
  Element.prototype.scrollIntoView = vi.fn() as unknown as Element['scrollIntoView']
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------
// Open / close gating
// ---------------------------------------------------------------------

describe('open / close gating', () => {
  it('renders nothing when `open` is false', () => {
    const { container } = render(
      <ChatAssistantDrawer
        open={false}
        onOpenChange={onOpenChange}
        messages={[]}
        onSendMessage={onSendMessage}
      />,
    )
    // The conditional `{open && (...)}` wrapper means nothing renders.
    expect(container.querySelector('h2')).toBeNull()
  })

  it('renders the drawer header when `open` is true', () => {
    render(
      <ChatAssistantDrawer
        open={true}
        onOpenChange={onOpenChange}
        messages={[]}
        onSendMessage={onSendMessage}
      />,
    )
    // The mock returns the i18n key as-is, so `t('title')` → "title".
    expect(screen.getByText('title')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------

describe('message rendering', () => {
  it('renders a user message', () => {
    render(
      <ChatAssistantDrawer
        open={true}
        onOpenChange={onOpenChange}
        messages={[makeUserMessage('How much is my company worth?')]}
        onSendMessage={onSendMessage}
      />,
    )
    expect(screen.getByText('How much is my company worth?')).toBeInTheDocument()
  })

  it('renders an assistant message (via the markdown mock)', () => {
    render(
      <ChatAssistantDrawer
        open={true}
        onOpenChange={onOpenChange}
        messages={[makeAssistantMessage('Based on the data, EUR 1.2M ± 200k.')]}
        onSendMessage={onSendMessage}
      />,
    )
    const md = screen.getAllByTestId('md')
    expect(md.length).toBeGreaterThan(0)
    expect(md.some((el) => el.textContent?.includes('1.2M'))).toBe(true)
  })

  it('renders multiple messages in order', () => {
    render(
      <ChatAssistantDrawer
        open={true}
        onOpenChange={onOpenChange}
        messages={[
          makeUserMessage('first'),
          makeAssistantMessage('second'),
          makeUserMessage('third'),
        ]}
        onSendMessage={onSendMessage}
      />,
    )
    expect(screen.getByText('first')).toBeInTheDocument()
    // 'second' is inside the markdown mock for the assistant
    expect(
      screen.getAllByTestId('md').some((el) => el.textContent?.includes('second')),
    ).toBe(true)
    expect(screen.getByText('third')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------
// Input + send
// ---------------------------------------------------------------------

describe('input + send', () => {
  it('typing in the textarea and clicking Send fires onSendMessage with the text', () => {
    render(
      <ChatAssistantDrawer
        open={true}
        onOpenChange={onOpenChange}
        messages={[]}
        onSendMessage={onSendMessage}
      />,
    )

    const textarea = screen.getByLabelText('chatInput') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Help me normalize owner salary' } })

    const sendButton = screen.getByLabelText('send')
    fireEvent.click(sendButton)

    expect(onSendMessage).toHaveBeenCalledTimes(1)
    // First arg is the trimmed input text. Remaining args (attachments,
    // detectedValues, commands) are implementation details — the smoke
    // test only pins the user's typed text reaches the callback.
    expect(onSendMessage.mock.calls[0][0]).toBe('Help me normalize owner salary')
  })

  it('does not call onSendMessage when input is empty', () => {
    render(
      <ChatAssistantDrawer
        open={true}
        onOpenChange={onOpenChange}
        messages={[]}
        onSendMessage={onSendMessage}
      />,
    )

    const sendButton = screen.getByLabelText('send')
    fireEvent.click(sendButton)

    expect(onSendMessage).not.toHaveBeenCalled()
  })

  it('does not call onSendMessage when input is whitespace-only', () => {
    render(
      <ChatAssistantDrawer
        open={true}
        onOpenChange={onOpenChange}
        messages={[]}
        onSendMessage={onSendMessage}
      />,
    )

    const textarea = screen.getByLabelText('chatInput') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '    \n\t  ' } })

    const sendButton = screen.getByLabelText('send')
    fireEvent.click(sendButton)

    expect(onSendMessage).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------
// Close button
// ---------------------------------------------------------------------

describe('close button', () => {
  it('clicking the close button fires onOpenChange(false)', () => {
    render(
      <ChatAssistantDrawer
        open={true}
        onOpenChange={onOpenChange}
        messages={[]}
        onSendMessage={onSendMessage}
      />,
    )

    const closeButton = screen.getByLabelText('close')
    fireEvent.click(closeButton)

    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
