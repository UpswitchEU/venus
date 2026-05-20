import type { ChatMessage, ParsedCommand, ParsedValue } from '@/components/calculator'

export interface ManualPendingFieldUpdate {
  field: string
  value: unknown
  label: string
}

export interface ManualChatRetryPlan {
  retryPrompt: string
  messages: ChatMessage[]
}

export function buildPendingUpdatesFromDetectedValues(
  detectedValues: readonly ParsedValue[] | undefined
): ManualPendingFieldUpdate[] {
  if (!detectedValues?.length) return []
  return detectedValues.map((detectedValue) => ({
    field: detectedValue.field,
    value: detectedValue.value,
    label: detectedValue.label,
  }))
}

export function formatManualParsedCommandResponse(args: {
  parsedCommands: readonly ParsedCommand[]
  currentLocale: string
  heading: string
}): string {
  const currencyLocale = args.currentLocale === 'en' ? 'en-BE' : 'nl-BE'
  const commandsList = args.parsedCommands
    .map((command) => `- **${command.label}** → €${command.value.toLocaleString(currencyLocale)}`)
    .join('\n')

  return `${args.heading}\n\n${commandsList}`
}

export function buildManualChatRetryPlan(
  messages: readonly ChatMessage[],
  errorMessageId: string
): ManualChatRetryPlan | null {
  const errorMessageIndex = messages.findIndex((message) => message.id === errorMessageId)
  if (errorMessageIndex < 0) return null

  let retryPrompt: string | null = null
  let retryPromptIndex = -1
  for (let index = errorMessageIndex - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      retryPrompt = messages[index].content
      retryPromptIndex = index
      break
    }
  }
  if (!retryPrompt) return null

  return {
    retryPrompt,
    messages: messages.filter(
      (message, index) => message.id !== errorMessageId && index !== retryPromptIndex
    ),
  }
}
