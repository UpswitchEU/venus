/**
 * Derive the correct Mercury (parent app) URL based on the current hostname.
 *
 * Venus runs on a subdomain of Mercury (e.g. valuation.upswitch.app vs upswitch.app).
 * In preview/staging environments the subdomain includes a prefix
 * (e.g. preview.valuation.upswitch.app -> preview.upswitch.app).
 *
 * URL mapping:
 *   preview.valuation.upswitch.app  →  preview.upswitch.app
 *   staging.valuation.upswitch.app  →  staging.upswitch.app
 *   valuation.upswitch.app          →  upswitch.app
 *
 * This utility removes the need for NEXT_PUBLIC_MERCURY_URL to be configured
 * in every environment — it dynamically derives the correct URL at runtime.
 */
export function getMercuryUrl(): string {
  // Prefer explicit env vars when set (works on both server and client)
  const envUrl =
    process.env.NEXT_PUBLIC_MERCURY_URL ||
    process.env.NEXT_PUBLIC_PARENT_DOMAIN;
  if (envUrl) return envUrl;

  // Server-side without env vars — fall back to production
  if (typeof window === 'undefined') {
    return 'https://upswitch.app';
  }

  const hostname = window.location.hostname;

  // Local development
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }

  // Preview: preview.valuation.upswitch.app -> preview.upswitch.app
  if (hostname.startsWith('preview.valuation.')) {
    return `https://preview.${hostname.replace('preview.valuation.', '')}`;
  }

  // Staging: staging.valuation.upswitch.app -> staging.upswitch.app
  if (hostname.startsWith('staging.valuation.')) {
    return `https://staging.${hostname.replace('staging.valuation.', '')}`;
  }

  // Production: valuation.upswitch.app -> upswitch.app
  if (hostname.startsWith('valuation.')) {
    return `https://${hostname.replace('valuation.', '')}`;
  }

  // Unknown hostname — production fallback
  return 'https://upswitch.app';
}

/**
 * Resolve the Titan API base URL, environment-aware.
 *
 * Priority:
 *   1. NEXT_PUBLIC_BACKEND_URL (explicit)
 *   2. NEXT_PUBLIC_API_BASE_URL (explicit)
 *   3. Hostname-based detection (preview / staging → api-staging)
 *   4. Production fallback
 *
 * Use this everywhere Venus calls Titan so staging never accidentally hits prod.
 */
export function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL;
  if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:3002';
    }
    if (host.includes('preview.') || host.includes('staging.')) {
      return 'https://api-staging.upswitch.app';
    }
  }
  return 'https://api.upswitch.app';
}
