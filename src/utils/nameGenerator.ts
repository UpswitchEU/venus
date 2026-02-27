/**
 * Professional Valuation Report Name Generator
 * Generates simple, professional names like "Valuation Report #123"
 * Based on Ilara Mercury's straightforward naming approach
 *
 * AUTH-FIRST: All users are authenticated. Guest report numbering removed.
 */
export class NameGenerator {
  /** @deprecated AUTH-FIRST: Guest sessions no longer supported */
  private static readonly GUEST_REPORT_COUNT_KEY = 'upswitch_guest_report_count'

  /**
   * @deprecated AUTH-FIRST: Guest sessions no longer supported. Use generateValuationName instead.
   */
  private static getNextGuestReportNumber(): number {
    return Date.now() % 1000
  }

  /**
   * Generate a unique valuation report name based on a seed
   * AUTH-FIRST: All users are authenticated, using hash-based numbering
   */
  static generateValuationName(seedSource?: string): string {
    // AUTH-FIRST: Generate a unique number from seed for all authenticated users
    let hashSum = 0
    const seed = seedSource || Date.now().toString()

    for (let i = 0; i < seed.length; i++) {
      hashSum += seed.charCodeAt(i) * (i + 1)
    }

    // Generate a number between 100-999 for professional look
    const reportNumber = (hashSum % 900) + 100

    return `Valuation Report #${reportNumber}`
  }

  /**
   * Generate a name based on company name
   * Format: "[COMPANY NAME] business valuation" (e.g., "Amadeus business valuation")
   */
  static generateFromCompany(companyName: string): string {
    if (!companyName || !companyName.trim()) {
      return this.generateValuationName()
    }

    // Clean company name (remove extra spaces, trim)
    const cleanName = companyName.trim()

    return `${cleanName} business valuation`
  }

  /**
   * Generate a name with date context
   */
  static generateWithDate(baseName?: string): string {
    const date = new Date()
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]
    const month = monthNames[date.getMonth()]
    const day = date.getDate()

    if (baseName) {
      return `${baseName} ${month}-${day}`
    }

    return `Valuation Report ${month}-${day}`
  }
}
