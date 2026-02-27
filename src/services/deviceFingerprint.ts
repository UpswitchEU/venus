/**
 * Device Fingerprinting Utility
 * Generates consistent device fingerprints for guest user tracking
 */

import { generalLogger } from '../utils/logger'

class DeviceFingerprintService {
  private static instance: DeviceFingerprintService
  private fingerprint: string | null = null

  private constructor() {}

  static getInstance(): DeviceFingerprintService {
    if (!DeviceFingerprintService.instance) {
      DeviceFingerprintService.instance = new DeviceFingerprintService()
    }
    return DeviceFingerprintService.instance
  }

  async getFingerprint(): Promise<string> {
    if (this.fingerprint) {
      return this.fingerprint
    }

    try {
      this.fingerprint = await this.generateFingerprint()
      return this.fingerprint
    } catch (error) {
      generalLogger.warn('Failed to generate device fingerprint', { error })
      this.fingerprint = this.generateFallbackFingerprint()
      return this.fingerprint
    }
  }

  private async generateFingerprint(): Promise<string> {
    const components = [
      // Browser and system info
      navigator.userAgent,
      navigator.language,
      navigator.platform,

      // Screen properties
      screen.width,
      screen.height,
      screen.colorDepth,
      screen.pixelDepth,

      // Timezone
      new Date().getTimezoneOffset(),

      // Browser capabilities
      navigator.cookieEnabled ? '1' : '0',
      navigator.doNotTrack || '0',
      navigator.maxTouchPoints || '0',

      // Canvas fingerprint (if available)
      await this.getCanvasFingerprint(),

      // WebGL fingerprint (if available)
      await this.getWebGLFingerprint(),

      // Add some entropy
      Math.random().toString(36).substring(2, 15),
    ]

    const fingerprintString = components.filter(Boolean).join('|')

    // Use Web Crypto API for hashing
    if (crypto && crypto.subtle) {
      const encoder = new TextEncoder()
      const data = encoder.encode(fingerprintString)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const fingerprint = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

      // Add entropy validation
      if (fingerprint.length < 32) {
        throw new Error('Fingerprint too short - possible tampering')
      }

      return fingerprint
    } else {
      // Fallback for older browsers
      const fingerprint = this.simpleHash(fingerprintString)

      // Add entropy validation
      if (fingerprint.length < 8) {
        throw new Error('Fingerprint too short - possible tampering')
      }

      return fingerprint
    }
  }

  private async getCanvasFingerprint(): Promise<string> {
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return ''

      // Draw some text and shapes
      ctx.textBaseline = 'top'
      ctx.font = '14px Arial'
      ctx.fillText('Device fingerprint', 2, 2)
      ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'
      ctx.fillRect(0, 0, 100, 50)

      return canvas.toDataURL()
    } catch (_error) {
      return ''
    }
  }

  private async getWebGLFingerprint(): Promise<string> {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      if (!gl) return ''

      // Cast to WebGLRenderingContext for proper typing
      const glContext = gl as WebGLRenderingContext

      return [
        glContext.getParameter(glContext.VERSION),
        glContext.getParameter(glContext.VENDOR),
        glContext.getParameter(glContext.RENDERER),
        glContext.getParameter(glContext.SHADING_LANGUAGE_VERSION),
      ].join('|')
    } catch (_error) {
      return ''
    }
  }

  private generateFallbackFingerprint(): string {
    const components = [
      navigator.userAgent,
      screen.width,
      screen.height,
      new Date().getTimezoneOffset(),
      Math.random().toString(36).substring(2, 15),
    ]

    return this.simpleHash(components.join('|'))
  }

  private simpleHash(str: string): string {
    let hash = 0
    if (str.length === 0) return hash.toString()

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(16)
  }

  // Reset fingerprint (useful for testing)
  reset(): void {
    this.fingerprint = null
  }

  // Get fingerprint without generating if not exists
  getCachedFingerprint(): string | null {
    return this.fingerprint
  }
}

export const deviceFingerprintService = DeviceFingerprintService.getInstance()
