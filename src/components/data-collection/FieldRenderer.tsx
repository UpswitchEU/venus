/**
 * Field Renderer
 *
 * Single Responsibility: Render data collection fields based on collection method
 * SOLID Principles: SRP, OCP, LSP, ISP, DIP
 *
 * Renders data fields using appropriate UI patterns for each collection method:
 * - Manual forms: Traditional form inputs
 * - Conversational: Question-based input
 * - Suggestions: Click-based selection
 * - Fuzzy search: Search and select
 * - File upload: File input with parsing
 */

import React from 'react'
import { DataCollectionMethod, FieldRendererProps } from '../../types/data-collection'

// Import collection method specific renderers
import { ConversationalFieldRenderer } from './renderers/ConversationalFieldRenderer'
import { FileUploadFieldRenderer } from './renderers/FileUploadFieldRenderer'
import { FuzzySearchFieldRenderer } from './renderers/FuzzySearchFieldRenderer'
import { ManualFormFieldRenderer } from './renderers/ManualFormFieldRenderer'
import { SuggestionFieldRenderer } from './renderers/SuggestionFieldRenderer'

export const FieldRenderer: React.FC<FieldRendererProps> = (props) => {
  const { context } = props

  // Determine which renderer to use based on collection method
  const getRenderer = (method: DataCollectionMethod) => {
    switch (method) {
      case 'manual_form':
        return ManualFormFieldRenderer
      case 'conversational':
        return ConversationalFieldRenderer
      case 'suggestion':
        return SuggestionFieldRenderer
      case 'fuzzy_search':
        return FuzzySearchFieldRenderer
      case 'file_upload':
        return FileUploadFieldRenderer
      default:
        return ManualFormFieldRenderer // Fallback
    }
  }

  const Renderer = getRenderer(context.method)

  return <Renderer {...props} />
}

// Export individual renderers for direct use if needed
export { ConversationalFieldRenderer } from './renderers/ConversationalFieldRenderer'
export { FileUploadFieldRenderer } from './renderers/FileUploadFieldRenderer'
export { FuzzySearchFieldRenderer } from './renderers/FuzzySearchFieldRenderer'
export { ManualFormFieldRenderer } from './renderers/ManualFormFieldRenderer'
export { SuggestionFieldRenderer } from './renderers/SuggestionFieldRenderer'
