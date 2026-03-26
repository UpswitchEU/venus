/**
 * Data Transform Web Worker
 * 
 * Performs heavy data transformations in a background thread.
 * Useful for chart data preparation, aggregations, sorting, filtering.
 * 
 * Messages:
 * - sortData: Sort large datasets
 * - filterData: Filter large datasets (structured FilterSpec object; not arbitrary JS/expression strings)
 * - aggregateData: Aggregate/group data
 * - transformForChart: Transform data for chart libraries
 * - calculateStats: Calculate statistical metrics
 * 
 * @module workers/dataTransform
 *
 * filterData `filter` shape: logical nodes `{ op: 'and'|'or', conditions }`, `{ op: 'not', condition }`;
 * leaf nodes `{ op, field, value?, values? }` with op in eq, neq, gt, gte, lt, lte, in, contains.
 * Field paths use dots for nesting (e.g. parent.child).
 */

// Worker scope
/* global self */

/**
 * Sort large dataset
 */
function sortData({ data, key, direction = 'asc' }) {
  const startTime = performance.now()

  const sorted = [...data].sort((a, b) => {
    const aVal = key ? a[key] : a
    const bVal = key ? b[key] : b

    if (direction === 'asc') {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0
    } else {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0
    }
  })

  const duration = performance.now() - startTime

  return {
    data: sorted,
    duration_ms: Math.round(duration),
  }
}

/**
 * Read nested property by dot path (e.g. "a.b.c")
 */
function getByPath(obj, path) {
  if (path == null || path === '') {
    return obj
  }
  const parts = path.split('.')
  let cur = obj
  for (let i = 0; i < parts.length; i++) {
    if (cur == null) {
      return undefined
    }
    cur = cur[parts[i]]
  }
  return cur
}

/**
 * Evaluate a JSON-serializable filter tree (no eval / Function).
 */
function matchesFilter(item, spec) {
  if (spec == null || typeof spec !== 'object') {
    throw new Error('Filter spec must be a non-null object')
  }

  const { op } = spec

  if (op === 'and') {
    if (!Array.isArray(spec.conditions)) {
      throw new Error('Filter op "and" requires conditions array')
    }
    return spec.conditions.every((c) => matchesFilter(item, c))
  }

  if (op === 'or') {
    if (!Array.isArray(spec.conditions)) {
      throw new Error('Filter op "or" requires conditions array')
    }
    return spec.conditions.some((c) => matchesFilter(item, c))
  }

  if (op === 'not') {
    return !matchesFilter(item, spec.condition)
  }

  if (typeof spec.field !== 'string' || spec.field === '') {
    throw new Error('Leaf filter requires non-empty string field')
  }

  const val = getByPath(item, spec.field)

  switch (op) {
    case 'eq':
      return val === spec.value
    case 'neq':
      return val !== spec.value
    case 'gt':
      return val > spec.value
    case 'gte':
      return val >= spec.value
    case 'lt':
      return val < spec.value
    case 'lte':
      return val <= spec.value
    case 'in':
      if (!Array.isArray(spec.values)) {
        throw new Error('Filter op "in" requires values array')
      }
      return spec.values.includes(val)
    case 'contains': {
      const hay = val == null ? '' : String(val)
      const needle = spec.value == null ? '' : String(spec.value)
      return hay.includes(needle)
    }
    default:
      throw new Error(`Unknown filter op: ${op}`)
  }
}

/**
 * Filter large dataset
 */
function filterData({ data, filter }) {
  const startTime = performance.now()

  const filtered = data.filter((item) => matchesFilter(item, filter))

  const duration = performance.now() - startTime

  return {
    data: filtered,
    originalCount: data.length,
    filteredCount: filtered.length,
    duration_ms: Math.round(duration),
  }
}

/**
 * Aggregate/group data
 */
function aggregateData({ data, groupBy, aggregations }) {
  const startTime = performance.now()

  // Group data by key
  const groups = {}

  data.forEach((item) => {
    const key = groupBy ? item[groupBy] : 'all'

    if (!groups[key]) {
      groups[key] = []
    }

    groups[key].push(item)
  })

  // Apply aggregations
  const result = Object.entries(groups).map(([key, items]) => {
    const aggregated = { [groupBy]: key, count: items.length }

    aggregations.forEach((agg) => {
      const values = items.map((item) => item[agg.field]).filter((val) => val != null)

      switch (agg.type) {
        case 'sum':
          aggregated[agg.name || `${agg.field}_sum`] = values.reduce(
            (sum, val) => sum + val,
            0
          )
          break

        case 'avg':
          aggregated[agg.name || `${agg.field}_avg`] =
            values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0
          break

        case 'min':
          aggregated[agg.name || `${agg.field}_min`] =
            values.length > 0 ? Math.min(...values) : null
          break

        case 'max':
          aggregated[agg.name || `${agg.field}_max`] =
            values.length > 0 ? Math.max(...values) : null
          break

        case 'first':
          aggregated[agg.name || `${agg.field}_first`] =
            values.length > 0 ? values[0] : null
          break

        case 'last':
          aggregated[agg.name || `${agg.field}_last`] =
            values.length > 0 ? values[values.length - 1] : null
          break
      }
    })

    return aggregated
  })

  const duration = performance.now() - startTime

  return {
    data: result,
    groupCount: result.length,
    duration_ms: Math.round(duration),
  }
}

/**
 * Transform data for chart libraries
 */
function transformForChart({ data, chartType, xField, yField, options = {} }) {
  const startTime = performance.now()

  let transformed

  switch (chartType) {
    case 'line':
    case 'area':
      transformed = data.map((item) => ({
        x: item[xField],
        y: item[yField],
      }))
      break

    case 'bar':
    case 'column':
      transformed = data.map((item) => ({
        label: item[xField],
        value: item[yField],
      }))
      break

    case 'pie':
    case 'donut':
      transformed = data.map((item) => ({
        name: item[xField],
        value: item[yField],
      }))
      break

    case 'scatter':
      transformed = data.map((item) => ({
        x: item[xField],
        y: item[yField],
        label: item[options.labelField] || '',
      }))
      break

    default:
      transformed = data
  }

  const duration = performance.now() - startTime

  return {
    data: transformed,
    chartType,
    duration_ms: Math.round(duration),
  }
}

/**
 * Calculate statistical metrics
 */
function calculateStats({ data, field }) {
  const startTime = performance.now()

  const values = field ? data.map((item) => item[field]) : data
  const numericValues = values.filter((val) => typeof val === 'number')

  if (numericValues.length === 0) {
    return {
      stats: null,
      error: 'No numeric values found',
      duration_ms: Math.round(performance.now() - startTime),
    }
  }

  // Sort for median/percentile calculations
  const sorted = [...numericValues].sort((a, b) => a - b)

  const sum = numericValues.reduce((acc, val) => acc + val, 0)
  const mean = sum / numericValues.length

  const variance =
    numericValues.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
    numericValues.length

  const stdDev = Math.sqrt(variance)

  const stats = {
    count: numericValues.length,
    sum,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    median: sorted[Math.floor(sorted.length / 2)],
    variance,
    stdDev,
    p25: sorted[Math.floor(sorted.length * 0.25)],
    p75: sorted[Math.floor(sorted.length * 0.75)],
    p90: sorted[Math.floor(sorted.length * 0.9)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
  }

  const duration = performance.now() - startTime

  return {
    stats,
    duration_ms: Math.round(duration),
  }
}

// Message handler
self.addEventListener('message', (event) => {
  const { id, type, ...params } = event.data

  try {
    let result

    switch (type) {
      case 'sortData':
        result = sortData(params)
        break

      case 'filterData':
        result = filterData(params)
        break

      case 'aggregateData':
        result = aggregateData(params)
        break

      case 'transformForChart':
        result = transformForChart(params)
        break

      case 'calculateStats':
        result = calculateStats(params)
        break

      default:
        throw new Error(`Unknown message type: ${type}`)
    }

    self.postMessage({
      id,
      type,
      success: true,
      result,
    })
  } catch (error) {
    self.postMessage({
      id,
      type,
      success: false,
      error: error.message,
    })
  }
})

// Ready signal
self.postMessage({ type: 'ready' })

