import { serviceLogger } from '../utils/logger'

/**
 * Health Check Service - Monitors service availability and implements circuit breaker pattern
 * Inspired by IlaraAI Mercury health monitoring architecture
 */

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  services: {
    valuation_engine: boolean
    streaming: boolean
    triage: boolean
    registry: boolean
  }
  timestamp: number
  error?: string
}

interface ServiceHealth {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  responseTime: number
  lastCheck: number
  consecutiveFailures: number
  error?: string
}

interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open'
  failureCount: number
  lastFailureTime: number
  nextAttemptTime: number
}

class HealthCheckService {
  private services: Map<string, ServiceHealth> = new Map()
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map()
  private checkInterval: NodeJS.Timeout | null = null
  private listeners: Set<(status: HealthStatus) => void> = new Set()

  // Configuration
  private readonly CHECK_INTERVAL = 30000 // 30 seconds
  private readonly TIMEOUT = 5000 // 5 seconds
  private readonly MAX_FAILURES = 3
  private readonly CIRCUIT_OPEN_DURATION = 60000 // 1 minute

  constructor() {
    this.initializeServices()
    this.startPeriodicChecks()
  }

  private initializeServices(): void {
    const services = [
      { name: 'valuation_engine', url: '/api/health' },
      { name: 'streaming', url: '/api/v1/intelligent-conversation/health' },
      { name: 'triage', url: '/api/v1/intelligent-conversation/start' },
      { name: 'registry', url: '/api/registry/health' },
    ]

    services.forEach((service) => {
      this.services.set(service.name, {
        name: service.name,
        status: 'unhealthy',
        responseTime: 0,
        lastCheck: 0,
        consecutiveFailures: 0,
      })

      this.circuitBreakers.set(service.name, {
        state: 'closed',
        failureCount: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0,
      })
    })
  }

  private startPeriodicChecks(): void {
    // Initial check
    this.checkAllServices()

    // Periodic checks
    this.checkInterval = setInterval(() => {
      this.checkAllServices()
    }, this.CHECK_INTERVAL)
    this.checkInterval.unref?.()
  }

  private async checkAllServices(): Promise<void> {
    const promises = Array.from(this.services.keys()).map((serviceName) =>
      this.checkService(serviceName)
    )

    await Promise.allSettled(promises)
    this.notifyListeners()
  }

  private async checkService(serviceName: string): Promise<void> {
    const circuitBreaker = this.circuitBreakers.get(serviceName)
    const service = this.services.get(serviceName)

    if (!circuitBreaker || !service) return

    // Check circuit breaker state
    if (circuitBreaker.state === 'open') {
      if (Date.now() < circuitBreaker.nextAttemptTime) {
        // Circuit is still open
        service.status = 'unhealthy'
        service.lastCheck = Date.now()
        return
      } else {
        // Try to close circuit
        circuitBreaker.state = 'half-open'
      }
    }

    try {
      const startTime = Date.now()
      const response = await this.makeHealthRequest(serviceName)
      const responseTime = Date.now() - startTime

      if (response.ok) {
        // Success
        service.status = 'healthy'
        service.responseTime = responseTime
        service.consecutiveFailures = 0
        service.error = undefined

        // Reset circuit breaker
        circuitBreaker.state = 'closed'
        circuitBreaker.failureCount = 0
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
    } catch (error) {
      // Failure
      service.status = 'unhealthy'
      service.consecutiveFailures++
      service.error = error instanceof Error ? error.message : 'Unknown error'
      service.lastCheck = Date.now()

      // Update circuit breaker
      circuitBreaker.failureCount++
      circuitBreaker.lastFailureTime = Date.now()

      if (circuitBreaker.failureCount >= this.MAX_FAILURES) {
        circuitBreaker.state = 'open'
        circuitBreaker.nextAttemptTime = Date.now() + this.CIRCUIT_OPEN_DURATION
      }
    }
  }

  private async makeHealthRequest(serviceName: string): Promise<Response> {
    // NOTE: Health checks use Python engine directly (not through Node.js backend)
    // This is intentional - we need to verify Python engine health independently
    // Node.js backend health is checked separately via /api/health endpoint
    const pythonEngineUrl =
      process.env.NEXT_PUBLIC_VALUATION_ENGINE_URL ||
      process.env.NEXT_PUBLIC_VALUATION_API_URL ||
      'https://api.valuations.upswitch.app'

    const endpoints = {
      valuation_engine: `${pythonEngineUrl}/api/health`,
      streaming: `${pythonEngineUrl}/api/v1/intelligent-conversation/health`,
      triage: `${pythonEngineUrl}/api/v1/intelligent-conversation/start`,
      registry: `${pythonEngineUrl}/api/registry/health`,
    }

    const url = endpoints[serviceName as keyof typeof endpoints]
    if (!url) {
      throw new Error(`Unknown service: ${serviceName}`)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT)

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      })

      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  public async checkHealth(): Promise<HealthStatus> {
    await this.checkAllServices()
    return this.getHealthStatus()
  }

  public getHealthStatus(): HealthStatus {
    const services = Array.from(this.services.values())
    const healthyServices = services.filter((s) => s.status === 'healthy').length
    const totalServices = services.length

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy'
    if (healthyServices === totalServices) {
      overallStatus = 'healthy'
    } else if (healthyServices > totalServices / 2) {
      overallStatus = 'degraded'
    } else {
      overallStatus = 'unhealthy'
    }

    return {
      status: overallStatus,
      services: {
        valuation_engine: this.services.get('valuation_engine')?.status === 'healthy' || false,
        streaming: this.services.get('streaming')?.status === 'healthy' || false,
        triage: this.services.get('triage')?.status === 'healthy' || false,
        registry: this.services.get('registry')?.status === 'healthy' || false,
      },
      timestamp: Date.now(),
    }
  }

  public isServiceHealthy(serviceName: string): boolean {
    const service = this.services.get(serviceName)
    return service?.status === 'healthy' || false
  }

  public canMakeRequest(serviceName: string): boolean {
    const circuitBreaker = this.circuitBreakers.get(serviceName)
    if (!circuitBreaker) return false

    if (circuitBreaker.state === 'closed') {
      return true
    } else if (circuitBreaker.state === 'open') {
      return Date.now() >= circuitBreaker.nextAttemptTime
    } else {
      // half-open
      return true
    }
  }

  public getServiceMetrics(serviceName: string): ServiceHealth | null {
    return this.services.get(serviceName) || null
  }

  public getAllMetrics(): Map<string, ServiceHealth> {
    return new Map(this.services)
  }

  public addHealthListener(listener: (status: HealthStatus) => void): () => void {
    this.listeners.add(listener)

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notifyListeners(): void {
    const status = this.getHealthStatus()
    this.listeners.forEach((listener) => {
      try {
        listener(status)
      } catch (error) {
        serviceLogger.error('Health listener error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })
  }

  public destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
    this.listeners.clear()
  }
}

// Singleton instance
export const healthCheckService = new HealthCheckService()

// Export types
export type { CircuitBreakerState, HealthStatus, ServiceHealth }
