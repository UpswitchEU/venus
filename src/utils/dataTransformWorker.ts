/**
 * Data Transform Worker Client
 *
 * TypeScript wrapper for the Data Transform Web Worker.
 * Provides a Promise-based API for background data processing.
 *
 * @module utils/dataTransformWorker
 */

import { generalLogger } from './logger'

export interface SortDataResult<T = any> {
  data: T[]
  duration_ms: number
}

export interface FilterDataResult<T = any> {
  data: T[]
  originalCount: number
  filteredCount: number
  duration_ms: number
}

/** Leaf ops compare `getByPath(item, field)` to value(s). Use dot paths for nesting, e.g. `user.name`. */
export type FilterLeafOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains'

export type FilterLeaf = {
  op: FilterLeafOp
  field: string
  /** Right-hand side for eq, neq, ordering, contains */
  value?: unknown
  /** Allowed values for `in` */
  values?: unknown[]
}

export type FilterLogicalAnd = {
  op: 'and'
  conditions: FilterSpec[]
}

export type FilterLogicalOr = {
  op: 'or'
  conditions: FilterSpec[]
}

export type FilterLogicalNot = {
  op: 'not'
  condition: FilterSpec
}

/** JSON-serializable filter tree (no arbitrary JS strings). Evaluated in the worker without dynamic code. */
export type FilterSpec = FilterLeaf | FilterLogicalAnd | FilterLogicalOr | FilterLogicalNot

export interface AggregateDataResult {
  data: any[]
  groupCount: number
  duration_ms: number
}

export interface ChartDataResult {
  data: any[]
  chartType: string
  duration_ms: number
}

export interface StatsResult {
  stats: {
    count: number
    sum: number
    min: number
    max: number
    mean: number
    median: number
    variance: number
    stdDev: number
    p25: number
    p75: number
    p90: number
    p95: number
    p99: number
  } | null
  error?: string
  duration_ms: number
}

/**
 * Data Transform Worker Client
 * Manages Web Worker lifecycle and message passing
 */
class DataTransformWorkerClient {
  private worker: Worker | null = null
  private messageId = 0
  private pendingRequests = new Map<
    number,
    {
      resolve: (result: any) => void
      reject: (error: Error) => void
    }
  >()

  /**
   * Initialize the worker
   */
  private async init(): Promise<void> {
    if (this.worker) {
      return // Already initialized
    }

    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker('/workers/dataTransform.worker.js')

        this.worker.addEventListener('message', (event) => {
          const { id, type, success, result, error } = event.data

          if (type === 'ready') {
            generalLogger.info('[DataTransformWorker] Worker ready')
            resolve()
            return
          }

          const request = this.pendingRequests.get(id)
          if (request) {
            this.pendingRequests.delete(id)

            if (success) {
              request.resolve(result)
            } else {
              request.reject(new Error(error))
            }
          }
        })

        this.worker.addEventListener('error', (error) => {
          generalLogger.error('[DataTransformWorker] Worker error', {
            error: error.message,
          })
          reject(error)
        })
      } catch (error) {
        generalLogger.error('[DataTransformWorker] Failed to initialize', {
          error: error instanceof Error ? error.message : String(error),
        })
        reject(error)
      }
    })
  }

  /**
   * Send message to worker and wait for response
   */
  private async sendMessage<T>(type: string, params: any): Promise<T> {
    await this.init()

    if (!this.worker) {
      throw new Error('Worker not initialized')
    }

    return new Promise((resolve, reject) => {
      const id = this.messageId++

      this.pendingRequests.set(id, { resolve, reject })

      this.worker?.postMessage({ id, type, ...params })

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error('Worker request timeout'))
        }
      }, 30000)
    })
  }

  /**
   * Sort large dataset in background
   */
  async sortData<T = any>(
    data: T[],
    key?: string,
    direction: 'asc' | 'desc' = 'asc'
  ): Promise<SortDataResult<T>> {
    generalLogger.debug('[DataTransformWorker] Sorting data', {
      count: data.length,
      key,
      direction,
    })

    const result = await this.sendMessage<SortDataResult<T>>('sortData', {
      data,
      key,
      direction,
    })

    generalLogger.info('[DataTransformWorker] Data sorted', {
      duration_ms: result.duration_ms,
    })

    return result
  }

  /**
   * Filter large dataset in background using a structured filter (not a JS expression string).
   */
  async filterData<T = any>(data: T[], filter: FilterSpec): Promise<FilterDataResult<T>> {
    generalLogger.debug('[DataTransformWorker] Filtering data', {
      count: data.length,
      filter,
    })

    const result = await this.sendMessage<FilterDataResult<T>>('filterData', {
      data,
      filter,
    })

    generalLogger.info('[DataTransformWorker] Data filtered', {
      duration_ms: result.duration_ms,
      originalCount: result.originalCount,
      filteredCount: result.filteredCount,
    })

    return result
  }

  /**
   * Aggregate/group data in background
   */
  async aggregateData(
    data: any[],
    groupBy: string,
    aggregations: Array<{
      field: string
      type: 'sum' | 'avg' | 'min' | 'max' | 'first' | 'last'
      name?: string
    }>
  ): Promise<AggregateDataResult> {
    generalLogger.debug('[DataTransformWorker] Aggregating data', {
      count: data.length,
      groupBy,
      aggregations: aggregations.length,
    })

    const result = await this.sendMessage<AggregateDataResult>('aggregateData', {
      data,
      groupBy,
      aggregations,
    })

    generalLogger.info('[DataTransformWorker] Data aggregated', {
      duration_ms: result.duration_ms,
      groupCount: result.groupCount,
    })

    return result
  }

  /**
   * Transform data for chart libraries in background
   */
  async transformForChart(
    data: any[],
    chartType: 'line' | 'area' | 'bar' | 'column' | 'pie' | 'donut' | 'scatter',
    xField: string,
    yField: string,
    options?: { labelField?: string }
  ): Promise<ChartDataResult> {
    generalLogger.debug('[DataTransformWorker] Transforming data for chart', {
      count: data.length,
      chartType,
      xField,
      yField,
    })

    const result = await this.sendMessage<ChartDataResult>('transformForChart', {
      data,
      chartType,
      xField,
      yField,
      options,
    })

    generalLogger.info('[DataTransformWorker] Data transformed for chart', {
      duration_ms: result.duration_ms,
      chartType: result.chartType,
    })

    return result
  }

  /**
   * Calculate statistical metrics in background
   */
  async calculateStats(data: any[], field?: string): Promise<StatsResult> {
    generalLogger.debug('[DataTransformWorker] Calculating statistics', {
      count: data.length,
      field,
    })

    const result = await this.sendMessage<StatsResult>('calculateStats', {
      data,
      field,
    })

    generalLogger.info('[DataTransformWorker] Statistics calculated', {
      duration_ms: result.duration_ms,
      hasStats: !!result.stats,
    })

    return result
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
      this.pendingRequests.clear()

      generalLogger.info('[DataTransformWorker] Worker terminated')
    }
  }
}

// Export singleton instance
export const dataTransformWorker = new DataTransformWorkerClient()
