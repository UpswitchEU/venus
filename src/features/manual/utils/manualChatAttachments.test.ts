import { describe, expect, it } from 'vitest'
import {
  appendManualChatAttachmentContext,
  buildManualChatAttachmentSummaries,
  formatManualChatAttachmentContext,
} from './manualChatAttachments'

describe('manualChatAttachments', () => {
  it('reads bounded text and CSV attachments into agent context', async () => {
    const summaries = await buildManualChatAttachmentSummaries([
      new File(['account,revenue\n700000,120000'], 'trial-balance.csv', { type: 'text/csv' }),
    ])

    expect(summaries).toEqual([
      {
        name: 'trial-balance.csv',
        type: 'text/csv',
        size: 29,
        textPreview: 'account,revenue\n700000,120000',
        truncated: false,
      },
    ])
    expect(formatManualChatAttachmentContext(summaries)).toContain('trial-balance.csv')
    expect(formatManualChatAttachmentContext(summaries)).toContain('700000,120000')
  })

  it('keeps attachment-only sends valid by adding a default instruction', async () => {
    const summaries = await buildManualChatAttachmentSummaries([
      new File(['hello'], 'note.txt', { type: 'text/plain' }),
    ])

    expect(appendManualChatAttachmentContext('', summaries)).toContain(
      'Please review the attached file(s).'
    )
  })

  it('marks binary attachments as unavailable instead of pretending the agent can read them', async () => {
    const summaries = await buildManualChatAttachmentSummaries([
      new File([new Uint8Array([1, 2, 3])], 'report.pdf', { type: 'application/pdf' }),
    ])

    expect(summaries[0]).toMatchObject({
      name: 'report.pdf',
      type: 'application/pdf',
      omittedReason: 'binary_or_unsupported_inline_preview',
    })
    expect(formatManualChatAttachmentContext(summaries)).toContain('Inline content unavailable')
  })

  it('caps attachment count so a chat turn cannot flood the AI request', async () => {
    const files = Array.from(
      { length: 7 },
      (_, index) => new File([`file-${index}`], `file-${index}.txt`, { type: 'text/plain' })
    )

    const summaries = await buildManualChatAttachmentSummaries(files)
    expect(summaries).toHaveLength(6)
    expect(summaries[5]).toMatchObject({
      name: '2 more attachment(s)',
      omittedReason: 'attachment_count_limit',
    })
  })
})
