const MAX_ATTACHMENT_COUNT = 5
const MAX_TEXT_ATTACHMENT_BYTES = 200_000
const MAX_TEXT_PREVIEW_CHARS = 12_000

export interface ManualChatAttachmentSummary {
  name: string
  type: string
  size: number
  textPreview?: string
  truncated?: boolean
  omittedReason?: string
}

function getExtension(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name)
  return match?.[1]?.toLowerCase() ?? ''
}

function isReadableTextAttachment(file: File): boolean {
  const type = file.type.toLowerCase()
  const extension = getExtension(file.name)
  return (
    type.startsWith('text/') ||
    type === 'application/json' ||
    type === 'application/xml' ||
    type === 'application/csv' ||
    type === 'text/csv' ||
    ['csv', 'txt', 'md', 'json', 'xml', 'tsv'].includes(extension)
  )
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function sanitizeTextPreview(text: string): string {
  return text.split('\0').join('').replace(/\r\n/g, '\n').trim()
}

function readAttachmentText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  if (typeof FileReader === 'undefined') return new Response(file).text()

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'))
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsText(file)
  })
}

export async function buildManualChatAttachmentSummaries(
  attachments?: readonly File[]
): Promise<ManualChatAttachmentSummary[]> {
  if (!attachments?.length) return []

  const selected = attachments.slice(0, MAX_ATTACHMENT_COUNT)
  const summaries = await Promise.all(
    selected.map(async (file): Promise<ManualChatAttachmentSummary> => {
      const base = {
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
      }

      if (!isReadableTextAttachment(file)) {
        return {
          ...base,
          omittedReason: 'binary_or_unsupported_inline_preview',
        }
      }

      if (file.size > MAX_TEXT_ATTACHMENT_BYTES) {
        return {
          ...base,
          omittedReason: 'text_file_too_large_for_inline_preview',
        }
      }

      try {
        const raw = sanitizeTextPreview(await readAttachmentText(file))
        const textPreview = raw.slice(0, MAX_TEXT_PREVIEW_CHARS)
        return {
          ...base,
          textPreview,
          truncated: raw.length > MAX_TEXT_PREVIEW_CHARS,
        }
      } catch {
        return {
          ...base,
          omittedReason: 'read_failed',
        }
      }
    })
  )

  if (attachments.length <= MAX_ATTACHMENT_COUNT) return summaries

  return [
    ...summaries,
    {
      name: `${attachments.length - MAX_ATTACHMENT_COUNT} more attachment(s)`,
      type: 'application/octet-stream',
      size: 0,
      omittedReason: 'attachment_count_limit',
    },
  ]
}

export function formatManualChatAttachmentContext(
  summaries: readonly ManualChatAttachmentSummary[]
): string {
  if (summaries.length === 0) return ''

  return summaries
    .map((summary, index) => {
      const header = `${index + 1}. ${summary.name} (${summary.type}, ${formatBytes(summary.size)})`
      if (summary.textPreview) {
        const suffix = summary.truncated ? '\n[Preview truncated]' : ''
        return `${header}\n${summary.textPreview}${suffix}`
      }
      return `${header}\n[Inline content unavailable: ${summary.omittedReason ?? 'not_readable'}]`
    })
    .join('\n\n')
}

export function appendManualChatAttachmentContext(
  message: string,
  summaries: readonly ManualChatAttachmentSummary[]
): string {
  const attachmentContext = formatManualChatAttachmentContext(summaries)
  if (!attachmentContext) return message

  const trimmed = message.trim()
  const prompt = trimmed || 'Please review the attached file(s).'
  return `${prompt}\n\n[Attached file context]\n${attachmentContext}`
}
