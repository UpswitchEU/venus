'use client'

/**
 * Streaming-stable markdown renderer.
 *
 * Feeding a growing string straight into <ReactMarkdown> re-parses the WHOLE
 * document on every token, so completed paragraphs above the cursor re-render
 * (and partial syntax like a lone `**` flips shape as it closes) — the visible
 * "glitch" during streaming.
 *
 * Two fixes, the way Claude / streamdown / Cursor do it:
 *  1. Split the markdown into top-level blocks and render each in its own
 *     memoized <ReactMarkdown>. Only the final, growing block re-parses while
 *     streaming; finished blocks above are referentially identical strings and
 *     skip rendering entirely — no reflow, no flash.
 *  2. Hoist the components map + plugins to module scope so their identity is
 *     stable across renders. The command-pill click handler (the one piece that
 *     varies per message) is delivered via context instead of a closure, so the
 *     map never has to be rebuilt.
 */

import { CheckCheck, Copy, ExternalLink } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createContext, memo, type ReactNode, useContext, useMemo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/design-system/utils'
import { useTransientFlag } from '@/hooks/useTransientFlag'

// ---------------------------------------------------------------------------
// Command-pill context — lets the module-scope `em` renderer fire the parent's
// click handler without forcing the components map to be rebuilt per render.
// ---------------------------------------------------------------------------

type CommandPillHandler = ((command: string) => void) | undefined
const CommandPillContext = createContext<CommandPillHandler>(undefined)

export function CommandPillProvider({
  onCommandPillClick,
  children,
}: {
  onCommandPillClick?: (command: string) => void
  children: ReactNode
}) {
  return (
    <CommandPillContext.Provider value={onCommandPillClick}>{children}</CommandPillContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Block-level markdown splitting
// ---------------------------------------------------------------------------

/**
 * Split markdown into top-level blocks on blank lines, keeping fenced code
 * blocks (``` / ~~~) intact. Tables and tight lists contain no blank lines so
 * they stay whole; only loose, blank-line-separated content is split — which
 * renders identically but lets finished blocks memoize.
 */
export function splitMarkdownBlocks(markdown: string): string[] {
  if (!markdown) return []

  const lines = markdown.split('\n')
  const blocks: string[] = []
  let current: string[] = []
  let inFence = false
  let fenceChar = ''

  const flush = () => {
    if (current.length === 0) return
    const block = current.join('\n')
    if (block.trim().length > 0) blocks.push(block)
    current = []
  }

  for (const line of lines) {
    const fence = /^\s*(```+|~~~+)/.exec(line)
    if (fence) {
      const char = fence[1][0]
      if (!inFence) {
        inFence = true
        fenceChar = char
      } else if (char === fenceChar) {
        inFence = false
      }
      current.push(line)
      continue
    }

    if (!inFence && line.trim() === '') {
      flush()
      continue
    }

    current.push(line)
  }
  flush()

  return blocks
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function CodeBlock({ children, className }: { children: ReactNode; className?: string }) {
  const [copied, showCopied] = useTransientFlag(2000)
  const ca = useTranslations('chatAssistant')
  const lang = className?.replace(/^language-/, '') || ''
  const codeText = (
    Array.isArray(children) ? children.map(String).join('') : String(children)
  ).replace(/\n$/, '')

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codeText)
    showCopied()
  }

  return (
    <div className="relative group/code my-3 rounded-xl overflow-hidden border border-foreground/[0.08]">
      <div className="flex items-center justify-between px-4 py-2 bg-foreground/[0.06] border-b border-foreground/[0.06]">
        <span className="text-[11px] font-mono text-foreground/40 uppercase tracking-wider">
          {lang || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className={cn(
            'flex min-h-11 items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all touch-manipulation sm:min-h-0 sm:px-2',
            copied
              ? 'text-primary bg-primary/10'
              : 'text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.06]'
          )}
          aria-label={ca('copyCode')}
        >
          {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? ca('copied') : ca('copy')}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto bg-foreground/[0.03]">
        <code className="text-sm font-mono text-foreground/80 leading-relaxed">{codeText}</code>
      </pre>
    </div>
  )
}

// Emphasis doubles as an inline "command pill" when the agent quotes a command
// the user can run (e.g. *"normalise this"*). The handler comes from context so
// this stays a module-scope, stable-identity renderer.
function EmRenderer({ children }: { children?: ReactNode }) {
  const onCommandPillClick = useContext(CommandPillContext)
  const text = String(children)
  if (
    text.startsWith('"') ||
    text.toLowerCase().startsWith('normalis') ||
    text.toLowerCase().startsWith('zet ') ||
    text.toLowerCase().startsWith('pas ')
  ) {
    return (
      <button
        type="button"
        onClick={() => onCommandPillClick?.(text.replace(/^["']|["']$/g, ''))}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-3.5 py-2 text-primary text-sm font-medium not-italic cursor-pointer hover:bg-primary/20 hover:border-primary/30 active:scale-[0.98] transition-all touch-manipulation sm:min-h-0 sm:px-2.5 sm:py-1"
      >
        {children}
      </button>
    )
  }
  return <em className="italic text-foreground/70">{children}</em>
}

const REMARK_PLUGINS = [remarkGfm]

const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="text-lg font-semibold text-foreground mt-4 mb-2 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-semibold text-foreground mt-3 mb-2 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-foreground mt-2 mb-1 first:mt-0">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-[15px] sm:text-sm leading-relaxed text-foreground/90 mb-3 last:mb-0">
      {children}
    </p>
  ),
  ul: ({ children }) => <ul className="space-y-1.5 mb-3 last:mb-0">{children}</ul>,
  ol: ({ children }) => (
    <ol className="space-y-1.5 mb-3 last:mb-0 list-decimal list-inside">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="flex items-start gap-2 text-[15px] sm:text-sm text-foreground/85">
      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary/60 mt-2" />
      <span>{children}</span>
    </li>
  ),
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <EmRenderer>{children}</EmRenderer>,
  pre: ({ children }) => {
    const child = Array.isArray(children) ? children[0] : children
    if (child && typeof child === 'object' && 'props' in child) {
      return <CodeBlock className={child.props.className}>{child.props.children}</CodeBlock>
    }
    return <pre>{children}</pre>
  },
  code: ({ children }) => (
    <code className="px-1.5 py-0.5 rounded bg-foreground/[0.08] text-sm font-mono text-foreground/80">
      {children}
    </code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary/40 pl-4 my-3 text-foreground/70 italic">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-foreground/[0.08]">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-foreground/[0.04] border-b border-foreground/[0.08]">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left text-xs font-semibold text-foreground/70 uppercase tracking-wider">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-sm text-foreground/80 border-t border-foreground/[0.04]">
      {children}
    </td>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/30 hover:decoration-primary/60 transition-colors"
    >
      {children}
      <ExternalLink className="w-3 h-3 shrink-0" />
    </a>
  ),
  hr: () => <hr className="my-4 border-foreground/[0.08]" />,
}

const MarkdownBlock = memo(function MarkdownBlock({ source }: { source: string }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
      {source}
    </ReactMarkdown>
  )
})

/**
 * Render markdown as a sequence of memoized blocks. While streaming, only the
 * last (growing) block re-renders; finished blocks above stay put.
 */
export function StreamingMarkdown({ content }: { content: string }) {
  const blocks = useMemo(() => splitMarkdownBlocks(content), [content])
  return (
    <>
      {blocks.map((block, index) => (
        // Index keys are safe here: blocks are append-only, so a given index
        // always maps to the same logical block as content grows.
        <MarkdownBlock key={index} source={block} />
      ))}
    </>
  )
}
