/**
 * Environment Variable Utilities
 *
 * Provides Next.js-compatible environment variable access
 * Replaces Vite's import.meta.env with Next.js process.env
 *
 * MIGRATION NOTE: Prioritizes NEXT_PUBLIC_* over VITE_* for Next.js compatibility
 */

/**
 * Get environment variable value
 * Works in both client and server contexts
 *
 * Priority order: NEXT_PUBLIC_* > unprefixed > VITE_* (backward compat) > default
 *
 * @param key - The environment variable key (without NEXT_PUBLIC_ or VITE_ prefix)
 * @param defaultValue - Optional default value if env var not found
 * @returns The environment variable value or undefined
 */
export function getEnv(key: string, defaultValue?: string): string | undefined {
  if (typeof window !== 'undefined') {
    // Client-side: NEXT_PUBLIC_ is the ONLY way in Next.js
    return (
      process.env[`NEXT_PUBLIC_${key}`] ||
      process.env[key] ||
      process.env[`VITE_${key}`] || // Fallback for migration period
      defaultValue
    )
  }
  // Server-side: can use any env var
  return process.env[key] || process.env[`VITE_${key}`] || defaultValue
}

/**
 * Check if running in development mode
 */
export const isDev = process.env.NODE_ENV === 'development'

/**
 * Check if running in production mode
 */
export const isProd = process.env.NODE_ENV === 'production'

/**
 * Get the current environment mode
 */
export const mode = process.env.NODE_ENV || 'development'

/**
 * Environment variable accessor object (compatible with import.meta.env)
 *
 * IMPORTANT: Use NEXT_PUBLIC_* properties for new code
 * VITE_* properties are deprecated and will be removed in future versions
 */
export const env = {
  MODE: mode,
  DEV: isDev,
  PROD: isProd,

  // ============================================================================
  // PRIMARY: NEXT_PUBLIC_* prefixed vars (Next.js standard)
  // ============================================================================
  NEXT_PUBLIC_BACKEND_URL: getEnv('BACKEND_URL'),
  NEXT_PUBLIC_API_BASE_URL: getEnv('API_BASE_URL'),
  NEXT_PUBLIC_API_URL: getEnv('API_URL'),
  NEXT_PUBLIC_VALUATION_ENGINE_URL: getEnv('VALUATION_ENGINE_URL'),
  NEXT_PUBLIC_VALUATION_API_URL: getEnv('VALUATION_API_URL'),
  NEXT_PUBLIC_PYTHON_ENGINE_URL: getEnv('PYTHON_ENGINE_URL'),
  NEXT_PUBLIC_PARENT_DOMAIN: getEnv('PARENT_DOMAIN'),
  NEXT_PUBLIC_UNLIMITED_CREDITS_MODE: getEnv('UNLIMITED_CREDITS_MODE'),
  NEXT_PUBLIC_SUPABASE_URL: getEnv('SUPABASE_URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: getEnv('SUPABASE_ANON_KEY'),
  NEXT_PUBLIC_ENABLE_REGISTRY: getEnv('ENABLE_REGISTRY'),
  NEXT_PUBLIC_ENABLE_DOCUMENT_UPLOAD: getEnv('ENABLE_DOCUMENT_UPLOAD'),
  NEXT_PUBLIC_ENABLE_AI_CONVERSATION: getEnv('ENABLE_AI_CONVERSATION'),
  NEXT_PUBLIC_DEBUG: getEnv('DEBUG'),

  // ============================================================================
  // DEPRECATED: VITE_* prefixed vars (backward compatibility only)
  // Use NEXT_PUBLIC_* equivalents instead
  // ============================================================================
  /** @deprecated Use NEXT_PUBLIC_BACKEND_URL instead */
  VITE_BACKEND_URL: getEnv('BACKEND_URL'),
  /** @deprecated Use NEXT_PUBLIC_API_BASE_URL instead */
  VITE_API_BASE_URL: getEnv('API_BASE_URL'),
  /** @deprecated Use NEXT_PUBLIC_API_URL instead */
  VITE_API_URL: getEnv('API_URL'),
  /** @deprecated Use NEXT_PUBLIC_VALUATION_ENGINE_URL instead */
  VITE_VALUATION_ENGINE_URL: getEnv('VALUATION_ENGINE_URL'),
  /** @deprecated Use NEXT_PUBLIC_VALUATION_API_URL instead */
  VITE_VALUATION_API_URL: getEnv('VALUATION_API_URL'),
  /** @deprecated Use NEXT_PUBLIC_PYTHON_ENGINE_URL instead */
  VITE_PYTHON_ENGINE_URL: getEnv('PYTHON_ENGINE_URL'),
  /** @deprecated Use NEXT_PUBLIC_PARENT_DOMAIN instead */
  VITE_PARENT_DOMAIN: getEnv('PARENT_DOMAIN'),
  /** @deprecated Use NEXT_PUBLIC_UNLIMITED_CREDITS_MODE instead */
  VITE_UNLIMITED_CREDITS_MODE: getEnv('UNLIMITED_CREDITS_MODE'),
}
