/**
 * Web Workers - Centralized Exports
 *
 * Provides easy access to Web Worker clients:
 * - HTML parser worker
 * - Data transform worker
 *
 * @module utils/workers
 */

export type {
  AggregateDataResult,
  ChartDataResult,
  FilterDataResult,
  FilterSpec,
  SortDataResult,
  StatsResult,
} from '../dataTransformWorker'
export { dataTransformWorker } from '../dataTransformWorker'
export type {
  HTMLMetadata,
  HTMLParseResult,
  HTMLSanitizeResult,
  HTMLStructureResult,
  HTMLTextResult,
} from '../htmlParserWorker'
export { htmlParserWorker } from '../htmlParserWorker'
