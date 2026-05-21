/**
 * Performance Monitor Hook
 *
 * Monitors component performance and bundle loading metrics.
 * Helps identify performance bottlenecks and optimization opportunities.
 *
 * @module hooks/usePerformanceMonitor
 */

import React, { useCallback, useEffect, useRef } from 'react'
import { generalLogger } from '../utils/logger'

interface PerformanceMetrics {
  componentName: string
  renderCount: number
  lastRenderTime: number
  totalRenderTime: number
  averageRenderTime: number
  mountTime: number
  unmountTime?: number
  memoryUsage?: number
}

interface UsePerformanceMonitorOptions {
  componentName: string
  enableLogging?: boolean
  logThreshold?: number // Log if render time exceeds this (ms)
  enableMemoryTracking?: boolean
}

interface BrowserMemoryInfo {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

type PerformanceWithMemory = Performance & {
  memory?: BrowserMemoryInfo
}

/**
 * Performance Monitor Hook
 *
 * Tracks component render performance and provides optimization insights.
 * Automatically logs performance issues when thresholds are exceeded.
 */
export function usePerformanceMonitor(options: UsePerformanceMonitorOptions) {
  const {
    componentName,
    enableLogging = false,
    logThreshold = 16, // 60fps threshold
    enableMemoryTracking = false,
  } = options

  const metricsRef = useRef<PerformanceMetrics>({
    componentName,
    renderCount: 0,
    lastRenderTime: 0,
    totalRenderTime: 0,
    averageRenderTime: 0,
    mountTime: performance.now(),
  })

  const renderStartTimeRef = useRef<number>(0)

  // Track mount
  useEffect(() => {
    if (enableLogging) {
      generalLogger.info(`Component mounted: ${componentName}`, {
        component: componentName,
        timestamp: Date.now(),
      })
    }

    return () => {
      // Track unmount
      const unmountTime = performance.now()
      metricsRef.current.unmountTime = unmountTime

      if (enableLogging) {
        generalLogger.info(`Component unmounted: ${componentName}`, {
          component: componentName,
          totalRenderTime: metricsRef.current.totalRenderTime,
          averageRenderTime: metricsRef.current.averageRenderTime,
          renderCount: metricsRef.current.renderCount,
          lifetime: unmountTime - metricsRef.current.mountTime,
        })
      }
    }
  }, [componentName, enableLogging])

  // Track renders
  useEffect(() => {
    const renderStartTime = performance.now()
    renderStartTimeRef.current = renderStartTime

    return () => {
      const renderEndTime = performance.now()
      const renderTime = renderEndTime - renderStartTime

      const metrics = metricsRef.current
      metrics.renderCount += 1
      metrics.lastRenderTime = renderTime
      metrics.totalRenderTime += renderTime
      metrics.averageRenderTime = metrics.totalRenderTime / metrics.renderCount

      // Log performance issues
      if (enableLogging && renderTime > logThreshold) {
        generalLogger.warn(`Slow render detected: ${componentName}`, {
          component: componentName,
          renderTime,
          renderCount: metrics.renderCount,
          averageRenderTime: metrics.averageRenderTime,
          threshold: logThreshold,
        })
      }
    }
  })

  // Get current metrics
  const getMetrics = useCallback(() => {
    return { ...metricsRef.current }
  }, [])

  // Reset metrics (useful for testing)
  const resetMetrics = useCallback(() => {
    metricsRef.current = {
      componentName,
      renderCount: 0,
      lastRenderTime: 0,
      totalRenderTime: 0,
      averageRenderTime: 0,
      mountTime: performance.now(),
    }
  }, [componentName])

  // Memory tracking (if enabled)
  useEffect(() => {
    const performanceWithMemory = performance as PerformanceWithMemory
    if (!enableMemoryTracking || !performanceWithMemory.memory) return

    const trackMemory = () => {
      const memoryInfo = performanceWithMemory.memory
      if (!memoryInfo) return

      metricsRef.current.memoryUsage = memoryInfo.usedJSHeapSize

      if (enableLogging && memoryInfo.usedJSHeapSize > 50 * 1024 * 1024) {
        // 50MB
        generalLogger.warn(`High memory usage: ${componentName}`, {
          component: componentName,
          usedHeapSize: memoryInfo.usedJSHeapSize,
          totalHeapSize: memoryInfo.totalJSHeapSize,
          heapLimit: memoryInfo.jsHeapSizeLimit,
        })
      }
    }

    const interval = setInterval(trackMemory, 5000) // Check every 5 seconds
    return () => clearInterval(interval)
  }, [componentName, enableLogging, enableMemoryTracking])

  return {
    getMetrics,
    resetMetrics,
  }
}

/**
 * Bundle Loading Monitor
 *
 * Monitors dynamic import loading performance.
 */
export function monitorBundleLoad(bundleName: string, startTime: number = performance.now()) {
  const loadTime = performance.now() - startTime

  generalLogger.info(`Bundle loaded: ${bundleName}`, {
    bundleName,
    loadTime,
    timestamp: Date.now(),
  })

  // Track slow bundle loads (>500ms)
  if (loadTime > 500) {
    generalLogger.warn(`Slow bundle load: ${bundleName}`, {
      bundleName,
      loadTime,
      threshold: 500,
    })
  }

  return loadTime
}

/**
 * Lazy Component Wrapper with Performance Monitoring
 *
 * Wraps React.lazy components with automatic performance tracking.
 */
export function createMonitoredLazy<TProps extends object>(
  importFunc: () => Promise<{ default: React.ComponentType<TProps> }>,
  componentName: string
) {
  return React.lazy(() => {
    const startTime = performance.now()

    return importFunc().then((module) => {
      monitorBundleLoad(componentName, startTime)
      return module
    })
  })
}
