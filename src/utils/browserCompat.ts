/**
 * Browser Compatibility Detection Layer (Valuation Tester)
 *
 * Detects browser capabilities and provides fallback strategies
 * Helps debug browser-specific auth issues (especially Safari ITP)
 */

interface BrowserInfo {
  name: string
  version: string
  platform: string
  mobile: boolean
}

interface CompatibilityReport {
  browser: BrowserInfo
  features: {
    cookies: boolean
    localStorage: boolean
    sessionStorage: boolean
    fetch: boolean
    webSockets: boolean
    serviceWorker: boolean
  }
  privacy: {
    itp: boolean // Safari Intelligent Tracking Prevention
    enhancedTrackingProtection: boolean // Firefox
    privacyBadger: boolean // Browser extension detection
  }
  warnings: string[]
  recommendations: string[]
}

export const browserCompat = {
  /**
   * Detect if browser is Safari
   */
  isSafari(): boolean {
    const _ua = navigator.userAgent.toLowerCase()
    // Safari detection: has Safari in UA but not Chrome/Android
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  },

  /**
   * Detect if browser is Firefox
   */
  isFirefox(): boolean {
    return navigator.userAgent.toLowerCase().includes('firefox')
  },

  /**
   * Detect if browser is Chrome
   */
  isChrome(): boolean {
    const ua = navigator.userAgent.toLowerCase()
    return ua.includes('chrome') && !ua.includes('edge') && !ua.includes('edg')
  },

  /**
   * Detect if browser is Edge
   */
  isEdge(): boolean {
    return navigator.userAgent.toLowerCase().includes('edg')
  },

  /**
   * Get browser name
   */
  getBrowserName(): string {
    if (this.isSafari()) return 'Safari'
    if (this.isFirefox()) return 'Firefox'
    if (this.isChrome()) return 'Chrome'
    if (this.isEdge()) return 'Edge'
    return 'Other'
  },

  /**
   * Get browser version
   */
  getBrowserVersion(): string {
    const ua = navigator.userAgent
    let match

    if (this.isSafari()) {
      match = ua.match(/Version\/(\d+\.\d+)/)
    } else if (this.isFirefox()) {
      match = ua.match(/Firefox\/(\d+\.\d+)/)
    } else if (this.isChrome()) {
      match = ua.match(/Chrome\/(\d+\.\d+)/)
    } else if (this.isEdge()) {
      match = ua.match(/Edg\/(\d+\.\d+)/)
    }

    return match ? match[1] : 'Unknown'
  },

  /**
   * Detect if browser is mobile
   */
  isMobile(): boolean {
    return /iPhone|iPad|iPod|Android|webOS|BlackBerry|Windows Phone/i.test(navigator.userAgent)
  },

  /**
   * Detect Safari ITP (Intelligent Tracking Prevention)
   * ITP is active in Safari 13+
   */
  hasITP(): boolean {
    if (!this.isSafari()) return false

    const version = this.getBrowserVersion()
    const majorVersion = parseInt(version.split('.')[0])

    // ITP is active in Safari 13+
    return majorVersion >= 13
  },

  /**
   * Detect Firefox Enhanced Tracking Protection
   */
  hasEnhancedTrackingProtection(): boolean {
    if (!this.isFirefox()) return false

    // Firefox ETP is enabled by default in Firefox 69+
    const version = this.getBrowserVersion()
    const majorVersion = parseInt(version.split('.')[0])

    return majorVersion >= 69
  },

  /**
   * Check if cookies are enabled
   */
  areCookiesEnabled(): boolean {
    return navigator.cookieEnabled
  },

  /**
   * Check if localStorage is available
   */
  isLocalStorageAvailable(): boolean {
    try {
      const test = '__localStorage_test__'
      localStorage.setItem(test, test)
      localStorage.removeItem(test)
      return true
    } catch (_e) {
      return false
    }
  },

  /**
   * Check if sessionStorage is available
   */
  isSessionStorageAvailable(): boolean {
    try {
      const test = '__sessionStorage_test__'
      sessionStorage.setItem(test, test)
      sessionStorage.removeItem(test)
      return true
    } catch (_e) {
      return false
    }
  },

  /**
   * Check if fetch API is available
   */
  isFetchAvailable(): boolean {
    return typeof window.fetch === 'function'
  },

  /**
   * Check if WebSockets are available
   */
  areWebSocketsAvailable(): boolean {
    return 'WebSocket' in window
  },

  /**
   * Check if Service Workers are available
   */
  areServiceWorkersAvailable(): boolean {
    return 'serviceWorker' in navigator
  },

  /**
   * Test cookie support (more thorough than just checking cookieEnabled)
   */
  async testCookieSupport(): Promise<boolean> {
    try {
      // Set test cookie with SameSite=Lax (same as our auth cookie)
      document.cookie = 'test=1; SameSite=Lax; path=/'

      // Check if cookie was set
      const supported = document.cookie.includes('test=1')

      // Clean up
      document.cookie = 'test=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'

      return supported
    } catch (_e) {
      return false
    }
  },

  /**
   * Get detailed browser information
   */
  getBrowserInfo(): BrowserInfo {
    return {
      name: this.getBrowserName(),
      version: this.getBrowserVersion(),
      platform: navigator.platform,
      mobile: this.isMobile(),
    }
  },

  /**
   * Get comprehensive compatibility report
   */
  async getCompatibilityReport(): Promise<CompatibilityReport> {
    const warnings: string[] = []
    const recommendations: string[] = []

    const browser = this.getBrowserInfo()

    // Feature detection
    const features = {
      cookies: this.areCookiesEnabled() && (await this.testCookieSupport()),
      localStorage: this.isLocalStorageAvailable(),
      sessionStorage: this.isSessionStorageAvailable(),
      fetch: this.isFetchAvailable(),
      webSockets: this.areWebSocketsAvailable(),
      serviceWorker: this.areServiceWorkersAvailable(),
    }

    // Privacy features detection
    const privacy = {
      itp: this.hasITP(),
      enhancedTrackingProtection: this.hasEnhancedTrackingProtection(),
      privacyBadger: false, // Can't reliably detect browser extensions
    }

    // Generate warnings
    if (!features.cookies) {
      warnings.push('Cookies are disabled or blocked')
      recommendations.push('Enable cookies in your browser settings')
    }

    if (privacy.itp) {
      warnings.push('Safari ITP is active (may affect cross-site cookies)')
      recommendations.push('Our auth uses same-domain subdomains to bypass ITP')
    }

    if (privacy.enhancedTrackingProtection) {
      warnings.push('Firefox Enhanced Tracking Protection is active')
      recommendations.push('Our auth complies with ETP requirements')
    }

    if (!features.localStorage) {
      warnings.push('localStorage is not available (private browsing?)')
      recommendations.push('Some features may not work in private browsing mode')
    }

    if (!features.fetch) {
      warnings.push('Fetch API not available (very old browser)')
      recommendations.push('Please update your browser to the latest version')
    }

    return {
      browser,
      features,
      privacy,
      warnings,
      recommendations,
    }
  },

  /**
   * Log compatibility report to console (for debugging)
   */
  async logCompatibilityReport(): Promise<void> {
    const report = await this.getCompatibilityReport()

    console.group('🔍 Browser Compatibility Report')
    console.log(
      'Browser:',
      `${report.browser.name} ${report.browser.version} (${report.browser.platform})`
    )
    console.log('Mobile:', report.browser.mobile ? 'Yes' : 'No')
    console.log('\nFeatures:')
    Object.entries(report.features).forEach(([feature, supported]) => {
      console.log(`  ${feature}: ${supported ? '✅' : '❌'}`)
    })
    console.log('\nPrivacy Features:')
    Object.entries(report.privacy).forEach(([feature, active]) => {
      console.log(`  ${feature}: ${active ? '⚠️ Active' : '✅ Inactive'}`)
    })

    if (report.warnings.length > 0) {
      console.log('\n⚠️ Warnings:')
      report.warnings.forEach((warning) => console.log(`  - ${warning}`))
    }

    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:')
      report.recommendations.forEach((rec) => console.log(`  - ${rec}`))
    }

    console.groupEnd()
  },

  /**
   * Get user-friendly error message based on browser
   */
  getAuthErrorMessage(error: string): string {
    const browser = this.getBrowserName()

    if (error.includes('cookie') || error.includes('Cookie')) {
      if (browser === 'Safari' && this.hasITP()) {
        return 'Safari\'s privacy settings may be blocking authentication. Try using the "Login with Token" option or disable "Prevent Cross-Site Tracking" in Safari Settings → Privacy.'
      } else if (browser === 'Firefox' && this.hasEnhancedTrackingProtection()) {
        return "Firefox's Enhanced Tracking Protection may be blocking authentication. Try clicking the shield icon in the address bar and adjusting settings for this site."
      } else if (!this.areCookiesEnabled()) {
        return 'Cookies are disabled in your browser. Please enable cookies to use authentication.'
      }
    }

    return error
  },
}

/**
 * Initialize browser compatibility check on page load
 * (Optional - can be called in main app initialization)
 */
export const initBrowserCompatCheck = async () => {
  // Check if in development mode
  const isDev = process.env.NODE_ENV === 'development'

  if (isDev) {
    // Log compatibility report in development
    await browserCompat.logCompatibilityReport()
  }

  // Check for critical incompatibilities
  const report = await browserCompat.getCompatibilityReport()

  if (!report.features.cookies) {
    console.error('🚨 CRITICAL: Cookies are disabled. Authentication will not work.')
  }

  if (!report.features.fetch) {
    console.error('🚨 CRITICAL: Fetch API not available. Please update your browser.')
  }

  return report
}
