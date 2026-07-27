/**
 * Canonical 1200×630 share card exported from the Janus brand kit and copied
 * to Venus's public directory. A relative URL lets Next resolve it against
 * the configured production origin for every locale.
 */
export const UPSWITCH_BRAND_OG_IMAGE = {
  url: '/og-image.png',
  width: 1200,
  height: 630,
  alt: "Upswitch — Build Strong. Your life's work deserves better.",
  type: 'image/png',
} as const

export const UPSWITCH_BRAND_TWITTER_IMAGE = UPSWITCH_BRAND_OG_IMAGE.url
