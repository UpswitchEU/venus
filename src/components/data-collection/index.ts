/**
 * Data Collection Components
 *
 * Exports all data collection components for easy importing.
 * Provides a consistent API across manual and conversational flows.
 */

// Re-export types for convenience
export type {
  CollectionContext,
  CollectionProgress,
  CollectionSession,
  DataCollectionMethod,
  DataCollector,
  DataField,
  DataResponse,
  FieldRendererProps,
  QuestionRendererProps,
  ValidationRule,
  ValidationSeverity,
} from '../../types/data-collection'
export {
  BUSINESS_DATA_FIELDS,
  FIELD_QUESTIONS,
} from '../../types/data-collection'
// Core data collection component
export { DataCollection } from './DataCollection'
// Field renderer
export { FieldRenderer } from './FieldRenderer'
// Individual renderers (for advanced use cases)
export { ConversationalFieldRenderer } from './renderers/ConversationalFieldRenderer'
export { FileUploadFieldRenderer } from './renderers/FileUploadFieldRenderer'
export { FuzzySearchFieldRenderer } from './renderers/FuzzySearchFieldRenderer'
export { ManualFormFieldRenderer } from './renderers/ManualFormFieldRenderer'
export { SuggestionFieldRenderer } from './renderers/SuggestionFieldRenderer'
