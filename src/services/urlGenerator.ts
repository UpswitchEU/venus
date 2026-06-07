/**
 * URL Generator Service
 * Centralized URL generation following Ilara Mercury pattern
 *
 * Single Responsibility: Generate all application URLs consistently
 * SOLID Compliance: SRP - Only responsible for URL generation
 *
 * Usage:
 *   import UrlGeneratorService from '@/services/urlGenerator'
 *   router.push(UrlGeneratorService.reportById(reportId, { flow: 'manual' }))
 */
class UrlGeneratorService {
  /**
   * Get current locale from pathname or default to 'en'
   */
  private static getLocale(locale?: string): string {
    if (locale) return locale
    if (typeof window === 'undefined') return 'en'
    const match = window.location.pathname.match(/^\/(en|nl|fr)/)
    return (match?.[1] as 'en' | 'nl' | 'fr') || 'en'
  }

  static root = (locale?: string) => `/${this.getLocale(locale)}`
  static home = (locale?: string) => `/${this.getLocale(locale)}/home`

  // Valuation Reports Routes with unique keys
  static reports = (locale?: string) => `/${this.getLocale(locale)}/reports`

  /**
   * Generate report URL with optional query parameters
   * @param reportId - Report ID (e.g., 'val_1234567890_abc123')
   * @param queryParams - Optional query parameters (e.g., { flow: 'manual', prefilledQuery: 'SaaS' })
   * @param locale - Optional locale (defaults to current locale from URL)
   * @returns Full URL with query string (e.g., '/en/reports/val_1234567890_abc123?flow=manual&prefilledQuery=SaaS')
   */
  static reportById = (
    reportId: string,
    queryParams?: Record<string, string | boolean | null | undefined>,
    locale?: string
  ) => {
    const currentLocale = this.getLocale(locale)
    const baseUrl = `/${currentLocale}/reports/${reportId}`
    if (!queryParams || Object.keys(queryParams).length === 0) {
      return baseUrl
    }

    const params = new URLSearchParams()
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        params.append(key, String(value))
      }
    })

    const queryString = params.toString()
    return queryString ? `${baseUrl}?${queryString}` : baseUrl
  }

  static createNewReport = (locale?: string) => `/${this.getLocale(locale)}/reports/new`

  // Legacy routes for backward compatibility (will redirect)
  static legacyManual = (locale?: string) => `/${this.getLocale(locale)}/manual`
  static legacyAIGuided = (locale?: string) => `/${this.getLocale(locale)}/ai-guided`
  static legacyInstant = (locale?: string) => `/${this.getLocale(locale)}/instant`

  // Info pages
  static privacy = (locale?: string) => `/${this.getLocale(locale)}/privacy`
  static about = (locale?: string) => `/${this.getLocale(locale)}/about`
  static howItWorks = (locale?: string) => `/${this.getLocale(locale)}/how-it-works`

  // Error pages
  static notFound = (locale?: string) => `/${this.getLocale(locale)}/404`
}

export default UrlGeneratorService
