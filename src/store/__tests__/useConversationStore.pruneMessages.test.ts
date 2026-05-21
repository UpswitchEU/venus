/**
 * Tests for `pruneMessages` — the Venus conversation store's pure-function
 * memory-pressure prune. Triggered when the buffer crosses
 * PRUNE_THRESHOLD (120 messages); the result drops to ~MAX_MESSAGES (60
 * = KEEP_FIRST 10 + KEEP_RECENT 50, minus overlaps).
 *
 * Why this matters: long advisor-client conversations on the same
 * report can accumulate 100+ messages. Without proper dedup-by-id the
 * concat of the first-10 + last-50 slices can produce duplicate React
 * keys (when the overlapping window is smaller than KEEP_FIRST +
 * KEEP_RECENT), and duplicate keys produce double-renders + state
 * corruption. This test pins the dedup invariant explicitly.
 */

import { describe, expect, it } from 'vitest'
import type { Message } from '../../types/message'
import { mapServerHistoryToMessages, pruneMessages } from '../useConversationStore'

function msg(id: string, content = `m-${id}`): Message {
  return {
    id,
    type: 'user',
    role: 'user',
    content,
    timestamp: new Date(0),
  }
}

function makeMessages(count: number, prefix = 'msg'): Message[] {
  return Array.from({ length: count }, (_, i) => msg(`${prefix}-${i}`))
}

describe('pruneMessages', () => {
  it('returns the input unchanged when length is at-or-below MAX_MESSAGES (100)', () => {
    const input = makeMessages(100)
    expect(pruneMessages(input)).toBe(input)
  })

  it('returns the input unchanged for short conversations', () => {
    const input = makeMessages(5)
    expect(pruneMessages(input)).toBe(input)
  })

  it('returns the input unchanged on empty input', () => {
    expect(pruneMessages([])).toEqual([])
  })

  it('does NOT prune at exactly MAX_MESSAGES (boundary)', () => {
    const input = makeMessages(100)
    expect(pruneMessages(input)).toHaveLength(100)
  })

  it('prunes when length exceeds MAX_MESSAGES', () => {
    const input = makeMessages(101)
    const result = pruneMessages(input)
    expect(result.length).toBeLessThan(input.length)
  })

  it('keeps the first KEEP_FIRST (10) messages as the conversation opening', () => {
    const input = makeMessages(200)
    const result = pruneMessages(input)
    // First 10 of input should appear in the same order at the start
    // of the pruned result.
    for (let i = 0; i < 10; i++) {
      expect(result[i].id).toBe(input[i].id)
    }
  })

  it('keeps the last KEEP_RECENT (50) messages as the active thread', () => {
    const input = makeMessages(200)
    const result = pruneMessages(input)
    // Last 50 of input should appear at the end of the pruned result.
    const last50 = input.slice(-50)
    const resultTail = result.slice(-50)
    expect(resultTail.map((m) => m.id)).toEqual(last50.map((m) => m.id))
  })

  it('produces exactly KEEP_FIRST + KEEP_RECENT = 60 entries on a long conversation', () => {
    const input = makeMessages(200)
    const result = pruneMessages(input)
    expect(result).toHaveLength(60) // 10 first + 50 recent, no overlap
  })

  it('drops the middle of a long conversation (the un-kept window)', () => {
    const input = makeMessages(200)
    const result = pruneMessages(input)
    // Messages from index 10..149 (excluding the last 50) should be GONE.
    const droppedIds = input.slice(10, 150).map((m) => m.id)
    const resultIds = new Set(result.map((m) => m.id))
    for (const id of droppedIds) {
      expect(resultIds.has(id)).toBe(false)
    }
  })

  it('CRITICAL: dedups when first-10 and last-50 slices overlap (short-medium conversations)', () => {
    // Edge case: 105 messages. KEEP_FIRST=10 grabs ids 0-9. KEEP_RECENT=50
    // grabs ids 55-104. No overlap. Result: 60.
    // BUT — if KEEP_RECENT were larger than (length - KEEP_FIRST), the
    // recent slice would include some of the first-slice ids. The filter
    // step must dedup so React keys stay unique.
    //
    // Construct a deliberate-overlap scenario: 55 messages would skip
    // pruning entirely (≤ MAX_MESSAGES). 101 messages: first=0..9,
    // recent=51..100. No overlap. 101 messages doesn't trigger overlap.
    //
    // Force overlap by manually crafting an input where the same id
    // appears in both halves (e.g., duplicate ids in the input, which
    // can happen if a streaming message updates without changing its id).
    const input: Message[] = [
      ...makeMessages(10, 'first'), // ids first-0..first-9
      ...makeMessages(85, 'middle'), // ids middle-0..middle-84
      msg('first-3', 'duplicate of first-3 in the recent window'), // overlap!
      ...makeMessages(10, 'last'), // ids last-0..last-9
    ]
    // Total: 106. Prune threshold crossed. first-10 = first-0..first-9.
    // recent-50 = middle-46..middle-84 + first-3 dup + last-0..last-9
    // The duplicate first-3 in the recent slice must be filtered out.
    const result = pruneMessages(input)
    const idCounts = result.reduce<Record<string, number>>((acc, m) => {
      acc[m.id] = (acc[m.id] || 0) + 1
      return acc
    }, {})
    for (const [id, count] of Object.entries(idCounts)) {
      expect(count, `id "${id}" appears ${count} times — must be 1`).toBe(1)
    }
  })

  it('preserves order: first slice → recent slice (no reordering within slices)', () => {
    const input = makeMessages(200)
    const result = pruneMessages(input)
    // Check monotonic id-index within each slice.
    const firstSlice = result.slice(0, 10)
    const recentSlice = result.slice(-50)
    for (let i = 1; i < firstSlice.length; i++) {
      const a = parseInt(firstSlice[i - 1].id.split('-')[1], 10)
      const b = parseInt(firstSlice[i].id.split('-')[1], 10)
      expect(b).toBeGreaterThan(a)
    }
    for (let i = 1; i < recentSlice.length; i++) {
      const a = parseInt(recentSlice[i - 1].id.split('-')[1], 10)
      const b = parseInt(recentSlice[i].id.split('-')[1], 10)
      expect(b).toBeGreaterThan(a)
    }
  })

  it('boundary at 101 messages: prune fires, recent slice does NOT overlap first slice', () => {
    // 101 messages. First 10 = ids 0-9. Last 50 = ids 51-100. No overlap.
    // Pruned result = 60 messages.
    const input = makeMessages(101)
    const result = pruneMessages(input)
    expect(result).toHaveLength(60)
    expect(result[0].id).toBe('msg-0')
    expect(result[9].id).toBe('msg-9')
    expect(result[10].id).toBe('msg-51') // first of the recent slice
    expect(result[59].id).toBe('msg-100')
  })

  it('does not mutate the input array', () => {
    const input = makeMessages(200)
    const inputSnapshot = [...input]
    pruneMessages(input)
    expect(input).toEqual(inputSnapshot)
    expect(input).toHaveLength(200)
  })
})

describe('mapServerHistoryToMessages', () => {
  it('keeps tool_result rows as persisted metadata on the preceding assistant message', () => {
    const result = mapServerHistoryToMessages([
      {
        id: 'u-1',
        role: 'user',
        content: 'Add Acme as a client',
        created_at: '2026-05-21T09:00:00.000Z',
      },
      {
        id: 'a-1',
        role: 'assistant',
        content: 'I prepared the client creation card.',
        created_at: '2026-05-21T09:00:01.000Z',
      },
      {
        id: 'tr-1',
        role: 'tool_result',
        content: '{}',
        tool_name: 'create_client',
        tool_result: {
          type: 'client_create_request',
          data: {
            status: 'pending_approval',
            request: { business_name: 'Acme NV' },
          },
        },
        created_at: '2026-05-21T09:00:02.000Z',
      },
    ])

    expect(result).toHaveLength(2)
    expect(result[1]).toMatchObject({
      id: 'a-1',
      role: 'assistant',
      metadata: {
        persistedToolResults: [
          {
            id: 'tr-1',
            toolName: 'create_client',
            result: {
              status: 'pending_approval',
              request: { business_name: 'Acme NV' },
            },
          },
        ],
      },
    })
  })

  it('falls back to JSON content for older tool_result rows without structured metadata', () => {
    const result = mapServerHistoryToMessages([
      {
        id: 'a-1',
        role: 'assistant',
        content: 'Valuation is ready.',
        created_at: '2026-05-21T09:00:01.000Z',
      },
      {
        id: 'tr-1',
        role: 'tool_result',
        content: JSON.stringify({
          status: 'pending_approval',
          request: { report_id: 'report-1', methods: ['dcf'] },
        }),
        tool_name: 'run_valuation',
        created_at: '2026-05-21T09:00:02.000Z',
      },
    ])

    expect(result[0].metadata?.persistedToolResults?.[0]).toMatchObject({
      toolName: 'run_valuation',
      result: {
        status: 'pending_approval',
        request: { report_id: 'report-1', methods: ['dcf'] },
      },
    })
  })
})
