/**
 * Conversational Field Renderer
 *
 * Single Responsibility: Render data fields as conversational questions
 * SOLID Principles: SRP, OCP, LSP, ISP, DIP
 *
 * Uses DataCollectorBase for shared validation and normalization logic
 */

import { Bot, HelpCircle } from 'lucide-react'
import React, { useState } from 'react'
import { chatCollector } from '../../../features/shared/dataCollection'
import { DataField, FieldRendererProps, ParsedFieldValue } from '../../../types/data-collection'

export const ConversationalFieldRenderer: React.FC<FieldRendererProps> = ({
  field,
  value,
  onChange,
  errors = [],
  context,
  disabled = false,
}) => {
  const [showHelp, setShowHelp] = useState(false)
  const hasErrors = errors.length > 0

  const handleResponse = (rawValue: ParsedFieldValue) => {
    // Use shared normalization logic from DataCollectorBase
    const normalizedValue = chatCollector.normalizeValue(field, rawValue)
    onChange(normalizedValue, chatCollector.getCollectionMethod())
  }

  // Get question from FIELD_QUESTIONS or generate one
  const question = getQuestionForField(field)
  const examples = getExamplesForField(field)
  const suggestions = field.suggestions || []

  return (
    <div className="space-y-4">
      {/* AI Assistant Header */}
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-white">Valuation Assistant</h3>
          <p className="text-xs text-zinc-400">Asking for {field.label.toLowerCase()}</p>
        </div>
        {field.description && (
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="text-zinc-400 hover:text-zinc-300"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Question */}
      <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
        <p className="text-white text-sm leading-relaxed">{question}</p>

        {/* Field Description */}
        {showHelp && field.description && (
          <div className="mt-3 pt-3 border-t border-zinc-600/50">
            <p className="text-xs text-zinc-400">💡 {field.description}</p>
          </div>
        )}

        {/* Examples */}
        {examples.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-zinc-500 mb-2">Examples:</p>
            <div className="flex flex-wrap gap-1">
              {examples.slice(0, 3).map((example, index) => (
                <button
                  key={index}
                  onClick={() => handleResponse(parseExample(example, field))}
                  disabled={disabled}
                  className="px-2 py-1 bg-zinc-700/50 hover:bg-zinc-600/50 text-xs text-zinc-300 rounded border border-zinc-600/50 hover:border-zinc-500/50 transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">Quick suggestions:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleResponse(parseSuggestion(suggestion, field))}
                disabled={disabled}
                className="px-3 py-2 bg-primary-600/20 hover:bg-primary-600/30 text-sm text-primary-300 rounded-lg border border-primary-600/30 hover:border-primary-600/50 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error Display */}
      {hasErrors && (
        <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3">
          <p className="text-sm text-red-400">
            {errors.find((e) => e.severity === 'error')?.message}
          </p>
        </div>
      )}
    </div>
  )
}

// Helper functions
function getQuestionForField(field: DataField): string {
  // In a real implementation, this would come from FIELD_QUESTIONS
  switch (field.id) {
    case 'company_name':
      return "What's the name of your business?"
    case 'revenue':
      return "What's your annual revenue for the most recent year?"
    case 'ebitda':
      return "What's your EBITDA (Earnings Before Interest, Taxes, Depreciation, and Amortization)?"
    case 'number_of_employees':
      return 'How many employees does your business have?'
    case 'industry':
      return 'What industry is your business in?'
    case 'country_code':
      return 'Where is your business headquartered?'
    default:
      return `What's your ${field.label.toLowerCase()}?`
  }
}

function getExamplesForField(field: DataField): string[] {
  switch (field.id) {
    case 'company_name':
      return ['TechCorp Inc.', 'Green Energy Solutions']
    case 'revenue':
      return ['€500,000', '£2.3 million', '$1.2M']
    case 'number_of_employees':
      return ['25', '5-10 team']
    default:
      return []
  }
}

function parseExample(example: string, field: DataField): ParsedFieldValue {
  // Use shared normalization from DataCollectorBase
  // This handles currency symbols, number parsing, boolean parsing, etc.
  return chatCollector.normalizeValue(field, example)
}

function parseSuggestion(suggestion: string, field: DataField): ParsedFieldValue {
  // Use shared normalization from DataCollectorBase
  return chatCollector.normalizeValue(field, suggestion)
}
