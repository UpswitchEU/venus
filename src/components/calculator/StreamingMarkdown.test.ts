import { describe, expect, it } from 'vitest'
import { splitMarkdownBlocks } from './StreamingMarkdown'

describe('splitMarkdownBlocks', () => {
  it('returns no blocks for empty input', () => {
    expect(splitMarkdownBlocks('')).toEqual([])
    expect(splitMarkdownBlocks('   \n  \n')).toEqual([])
  })

  it('splits paragraphs on blank lines', () => {
    expect(splitMarkdownBlocks('first\n\nsecond')).toEqual(['first', 'second'])
  })

  it('collapses runs of blank lines', () => {
    expect(splitMarkdownBlocks('a\n\n\n\nb')).toEqual(['a', 'b'])
  })

  it('keeps a fenced code block intact even when it contains blank lines', () => {
    const md = 'intro\n\n```ts\nconst a = 1\n\nconst b = 2\n```\n\nafter'
    expect(splitMarkdownBlocks(md)).toEqual([
      'intro',
      '```ts\nconst a = 1\n\nconst b = 2\n```',
      'after',
    ])
  })

  it('keeps a tight list as a single block', () => {
    const md = '- one\n- two\n- three'
    expect(splitMarkdownBlocks(md)).toEqual([md])
  })

  it('keeps a table as a single block (tables have no blank lines)', () => {
    const md = '| a | b |\n| - | - |\n| 1 | 2 |'
    expect(splitMarkdownBlocks(md)).toEqual([md])
  })

  it('keeps already-finished blocks byte-identical as the text grows (memoization invariant)', () => {
    // Streaming appends to the tail; the block-memo only pays off if the
    // earlier blocks are referentially-stable strings across growth steps.
    const steps = [
      'Enterprise value\n\nMinus net d',
      'Enterprise value\n\nMinus net debt\n\nEquals eq',
      'Enterprise value\n\nMinus net debt\n\nEquals equity value',
    ]
    const [a, b, c] = steps.map(splitMarkdownBlocks)
    expect(a[0]).toBe('Enterprise value')
    expect(b[0]).toBe('Enterprise value')
    expect(c[0]).toBe('Enterprise value')
    expect(b[1]).toBe('Minus net debt')
    expect(c[1]).toBe('Minus net debt')
  })
})
