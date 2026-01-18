/**
 * Bootstrap Utilities
 * 
 * Helper functions for the bootstrap process.
 * 
 * @module lib/bootstrap/utils
 */

import type { BootstrapContext, BootstrapHints, FlowType } from './types';

/**
 * Parse URL and context into bootstrap hints
 */
export function parseBootstrapHints(context: BootstrapContext): BootstrapHints {
  const { reportId, clientToken, guestSessionId, prefilledQuery, flow, mode, locale, embedded } = context;
  
  // CRITICAL FIX: If we have a reportId from the URL, it's NEVER a new report
  // The isRecentReportId check was causing issues where valid URL report IDs
  // were treated as "new" and regenerated
  const hasValidReportId = !!reportId && reportId.startsWith('val_');
  
  // Only consider it a new report if there's NO report ID at all
  const isNewReport = !hasValidReportId;
  
  return {
    hasClientToken: !!clientToken && clientToken.length > 20,
    hasReportId: hasValidReportId,
    hasGuestSessionId: !!guestSessionId && guestSessionId.length > 0,
    hasPrefilledQuery: !!prefilledQuery && prefilledQuery.length > 0,
    isNewReport,
    isEmbedded: !!embedded,
    requestedFlow: flow || null,
    requestedMode: mode || null,
    locale: locale || 'en',
  };
}

/**
 * Check if a report ID was created recently (within last minute)
 * NOTE: This function is kept for potential future use but is no longer
 * used in parseBootstrapHints to prevent treating valid URL report IDs as new
 */
export function isRecentReportId(reportId: string): boolean {
  try {
    // Format: val_{timestamp}_{source}{random}
    const match = reportId.match(/^val_(\d+)_/);
    if (!match) return false;
    
    const timestamp = parseInt(match[1], 10);
    const now = Date.now();
    const oneMinute = 60 * 1000;
    
    return now - timestamp < oneMinute;
  } catch {
    return false;
  }
}

/**
 * Generate a new report ID with Venus source encoding
 * Format: val_{timestamp}_v{random}
 */
export function generateReportId(): string {
  const timestamp = Date.now();
  const random = generateRandomString(10);
  return `val_${timestamp}_v${random}`;
}

/**
 * Generate a random alphanumeric string
 */
function generateRandomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Parse URL search params into BootstrapContext
 */
export function parseUrlToContext(url: string, cookies?: string): BootstrapContext {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;
    
    // Extract report ID from pathname
    // Paths: /reports/new, /reports/{id}, /{locale}/reports/{id}
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    let reportId: string | undefined;
    
    const reportsIndex = pathParts.indexOf('reports');
    if (reportsIndex !== -1 && pathParts[reportsIndex + 1]) {
      const potentialId = pathParts[reportsIndex + 1];
      if (potentialId !== 'new' && potentialId.startsWith('val_')) {
        reportId = potentialId;
      }
    }
    
    // Extract locale from pathname
    const localeMatch = urlObj.pathname.match(/^\/(en|nl|fr|de)\//);
    const locale = localeMatch ? localeMatch[1] : 'en';
    
    return {
      url,
      reportId,
      clientToken: params.get('clientToken') || undefined,
      prefilledQuery: params.get('prefilledQuery') || undefined,
      guestSessionId: params.get('guestSessionId') || undefined,
      flow: (params.get('flow') as FlowType) || undefined,
      // ✅ CRITICAL FIX: Only accept valid mode values ('edit' or 'view')
      // Invalid values from URL params (like 'accountant') will be filtered out
      mode: (['edit', 'view'].includes(params.get('mode') || '') ? params.get('mode') as 'edit' | 'view' : undefined),
      version: params.get('version') ? parseInt(params.get('version')!, 10) : undefined,
      locale,
      embedded: params.get('embedded') === 'true',
      returnUrl: params.get('return_url') || undefined,
      sourceApp: params.get('source') || undefined,
      cookies,
    };
  } catch (error) {
    console.error('[Bootstrap] Failed to parse URL:', error);
    return {
      url,
      locale: 'en',
    };
  }
}

/**
 * Calculate prefill confidence score based on populated fields
 */
export function calculatePrefillConfidence(
  populatedFields: string[],
  totalFields: string[]
): number {
  if (totalFields.length === 0) return 0;
  
  // Weight certain fields more heavily
  const fieldWeights: Record<string, number> = {
    company_name: 3,
    business_type_id: 2,
    industry: 2,
    revenue: 3,
    ebitda: 3,
    country_code: 1,
    founding_year: 1,
    employee_count: 1,
    kbo_number: 2,
  };
  
  let totalWeight = 0;
  let populatedWeight = 0;
  
  for (const field of totalFields) {
    const weight = fieldWeights[field] || 1;
    totalWeight += weight;
    if (populatedFields.includes(field)) {
      populatedWeight += weight;
    }
  }
  
  return totalWeight > 0 ? populatedWeight / totalWeight : 0;
}

/**
 * Merge objects with priority (later arguments take precedence)
 * Works with any object type, not just those with index signatures.
 */
export function mergeWithPriority<T extends object>(
  ...sources: (T | null | undefined)[]
): T {
  const result: Record<string, unknown> = {};
  
  for (const source of sources) {
    if (!source) continue;
    
    for (const [key, value] of Object.entries(source)) {
      // Only override if value is not null/undefined
      if (value !== null && value !== undefined) {
        result[key] = value;
      }
    }
  }
  
  return result as T;
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

/**
 * Truncate string for logging (PII safety)
 */
export function truncateForLog(str: string | undefined, length: number = 8): string {
  if (!str) return 'undefined';
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}
