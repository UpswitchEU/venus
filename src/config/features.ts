/**
 * Feature Flags Configuration for Valuation Tester
 *
 * Centralized feature flag management for the valuation tester frontend
 */

import { env } from '../utils/env'
import { generalLogger } from '../utils/logger'

export const FEATURE_FLAGS = {
  // Credit System Flags
  UNLIMITED_CREDITS_MODE: env.NEXT_PUBLIC_UNLIMITED_CREDITS_MODE !== 'false',
  SHOW_CREDIT_BADGE: process.env.NEXT_PUBLIC_SHOW_CREDIT_BADGE !== 'false',
  SHOW_USAGE_STATS: process.env.NEXT_PUBLIC_SHOW_USAGE_STATS === 'true',
  ENABLE_PREMIUM_UPSELL: process.env.NEXT_PUBLIC_ENABLE_PREMIUM_UPSELL === 'true',

  // UI/UX Flags
  SHOW_ONBOARDING_TOOLTIPS: process.env.NEXT_PUBLIC_SHOW_ONBOARDING_TOOLTIPS !== 'false',
  ENABLE_ANIMATIONS: process.env.NEXT_PUBLIC_ENABLE_ANIMATIONS !== 'false',
  SHOW_CREDIT_ANALYTICS: process.env.NEXT_PUBLIC_SHOW_CREDIT_ANALYTICS === 'true',

  // Session & Persistence Flags
  ENABLE_SESSION_RESTORATION: process.env.NEXT_PUBLIC_ENABLE_SESSION_RESTORATION !== 'false', // Default: enabled

  // Development Flags
  DEBUG_CREDIT_SYSTEM: process.env.NEXT_PUBLIC_DEBUG_CREDIT_SYSTEM === 'true',
  MOCK_CREDIT_DATA: process.env.NEXT_PUBLIC_MOCK_CREDIT_DATA === 'true',
}

// Helper functions for feature flag checks
export const isUnlimitedCreditsMode = (): boolean => FEATURE_FLAGS.UNLIMITED_CREDITS_MODE
export const shouldShowCreditBadge = (): boolean => FEATURE_FLAGS.SHOW_CREDIT_BADGE
export const shouldShowUsageStats = (): boolean => FEATURE_FLAGS.SHOW_USAGE_STATS
export const shouldEnablePremiumUpsell = (): boolean => FEATURE_FLAGS.ENABLE_PREMIUM_UPSELL
export const shouldShowOnboardingTooltips = (): boolean => FEATURE_FLAGS.SHOW_ONBOARDING_TOOLTIPS
export const shouldEnableAnimations = (): boolean => FEATURE_FLAGS.ENABLE_ANIMATIONS
export const shouldShowCreditAnalytics = (): boolean => FEATURE_FLAGS.SHOW_CREDIT_ANALYTICS
export const shouldEnableSessionRestoration = (): boolean =>
  FEATURE_FLAGS.ENABLE_SESSION_RESTORATION
export const isDebugCreditSystem = (): boolean => FEATURE_FLAGS.DEBUG_CREDIT_SYSTEM
export const shouldMockCreditData = (): boolean => FEATURE_FLAGS.MOCK_CREDIT_DATA

// Environment-specific configurations
export const getEnvironmentConfig = () => {
  const isDevelopment = process.env.NODE_ENV === 'development'
  const isProduction = process.env.NODE_ENV === 'production'

  return {
    isDevelopment,
    isProduction,
    apiUrl:
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      'http://localhost:3001',
    creditApiUrl: process.env.NEXT_PUBLIC_CREDIT_API_URL || 'http://localhost:3001/api/credits',
  }
}

// Feature flag validation
export const validateFeatureFlags = () => {
  const warnings: string[] = []

  if (FEATURE_FLAGS.UNLIMITED_CREDITS_MODE && FEATURE_FLAGS.ENABLE_PREMIUM_UPSELL) {
    warnings.push(
      'Unlimited credits mode is enabled but premium upselling is also enabled. This may confuse users.'
    )
  }

  if (FEATURE_FLAGS.SHOW_CREDIT_ANALYTICS && !FEATURE_FLAGS.SHOW_USAGE_STATS) {
    warnings.push(
      'Credit analytics are enabled but usage stats are disabled. Analytics may not display properly.'
    )
  }

  if (FEATURE_FLAGS.DEBUG_CREDIT_SYSTEM && process.env.NODE_ENV === 'production') {
    warnings.push('Debug mode is enabled in production. This should be disabled.')
  }

  return warnings
}

// Log feature flags on startup (development only)
if (process.env.NODE_ENV === 'development') {
  generalLogger.info('Valuation Tester Feature Flags loaded', FEATURE_FLAGS)
  const warnings = validateFeatureFlags()
  if (warnings.length > 0) {
    generalLogger.warn('Feature Flag validation warnings', { warnings })
  }
}
