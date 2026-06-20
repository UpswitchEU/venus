import { getApiUrl } from '../../../utils/getMercuryUrl'

const VERSION_API_TIMEOUT_MS = 10_000

export interface APIRequestConfig {
  signal?: AbortSignal
  timeout?: number
}

export interface VersionAPIRequest {
  method: string
  url: string
  data?: unknown
  headers?: Record<string, string>
}

interface VersionAPIClientOptions {
  baseURL?: string
  useProxy?: boolean
}

export class VersionAPIClient {
  private readonly baseURL: string
  private readonly useProxy: boolean

  constructor(options: VersionAPIClientOptions = {}) {
    this.useProxy = options.useProxy ?? typeof window !== 'undefined'
    this.baseURL = options.baseURL ?? (this.useProxy ? '' : getApiUrl())
  }

  resolveUrl(path: string): string {
    if (this.useProxy) {
      return path.replace('/api/v2/valuations/sessions/', '/api/valuations/sessions/')
    }
    return `${this.baseURL}${path}`
  }

  async request<T>(config: VersionAPIRequest, options?: APIRequestConfig): Promise<T> {
    const url = this.resolveUrl(config.url)
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      options?.timeout ?? VERSION_API_TIMEOUT_MS
    )
    const abortFromCaller = () => controller.abort()

    if (options?.signal) {
      options.signal.addEventListener('abort', abortFromCaller, { once: true })
      if (options.signal.aborted) {
        abortFromCaller()
      }
    }

    try {
      const response = await fetch(url, {
        method: config.method,
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: config.data ? JSON.stringify(config.data) : undefined,
        credentials: 'include',
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`)
      }

      return response.json()
    } finally {
      clearTimeout(timeoutId)
      options?.signal?.removeEventListener('abort', abortFromCaller)
    }
  }
}
