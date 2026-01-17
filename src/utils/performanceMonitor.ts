/**
 * Performance Monitor Utility
 * 
 * BANK GRADE: Client-side performance tracking for critical operations
 * Tracks loading times, API calls, and user experience metrics
 */

interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: number;
  success: boolean;
  metadata?: Record<string, any>;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private readonly MAX_METRICS = 100; // Keep last 100 metrics

  /**
   * Track operation performance
   */
  async trackOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = performance.now();
    
    try {
      const result = await fn();
      const duration = performance.now() - startTime;
      
      this.recordMetric({
        operation,
        duration,
        timestamp: Date.now(),
        success: true,
        metadata,
      });
      
      // Log slow operations
      if (duration > 1000) {
        console.warn(`[Performance] Slow operation: ${operation} took ${duration.toFixed(2)}ms`, metadata);
      }
      
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      this.recordMetric({
        operation,
        duration,
        timestamp: Date.now(),
        success: false,
        metadata: {
          ...metadata,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      
      console.error(`[Performance] Failed operation: ${operation} after ${duration.toFixed(2)}ms`, error);
      throw error;
    }
  }

  /**
   * Record a performance metric
   */
  private recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    
    // Keep only last MAX_METRICS
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics.shift();
    }
  }

  /**
   * Get performance summary
   */
  getSummary(): {
    totalOperations: number;
    successRate: number;
    averageDuration: number;
    slowOperations: PerformanceMetric[];
  } {
    if (this.metrics.length === 0) {
      return {
        totalOperations: 0,
        successRate: 0,
        averageDuration: 0,
        slowOperations: [],
      };
    }

    const successfulOps = this.metrics.filter(m => m.success).length;
    const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);
    const slowOps = this.metrics.filter(m => m.duration > 1000);

    return {
      totalOperations: this.metrics.length,
      successRate: (successfulOps / this.metrics.length) * 100,
      averageDuration: totalDuration / this.metrics.length,
      slowOperations: slowOps,
    };
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Measure operation (alias for trackOperation for backward compatibility)
   * Supports both old API (4 args) and new API (3 args)
   */
  async measure<T>(
    operation: string,
    fn: () => Promise<T>,
    thresholdOrMetadata?: number | Record<string, any>,
    metadata?: Record<string, any>
  ): Promise<T> {
    // Handle both API signatures
    const actualMetadata = typeof thresholdOrMetadata === 'object' 
      ? thresholdOrMetadata 
      : metadata;
    
    return this.trackOperation(operation, fn, actualMetadata);
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Backward compatibility aliases
export const globalPerformanceMonitor = performanceMonitor;

// Performance thresholds for monitoring
export const performanceThresholds = {
  slow: 1000, // 1 second
  warning: 500, // 500ms
  fast: 100, // 100ms
  // Operation-specific thresholds
  sessionCreate: 3000, // 3 seconds
  sessionLoad: 2000, // 2 seconds
  sessionSave: 1000, // 1 second
  apiCall: 5000, // 5 seconds
};
