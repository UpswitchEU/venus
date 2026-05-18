import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ✅ WORLD CLASS: Disable source maps in production for optimal bundle size
  // Source maps are only needed for debugging - disable in production for better performance
  productionBrowserSourceMaps: process.env.NODE_ENV === 'development',

  // Disable React error overlay in production
  reactStrictMode: true,
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },

  outputFileTracingExcludes: {
    '/*': [
      '**/node_modules/@swc/core-linux-x64-gnu/**',
      '**/node_modules/@swc/core-linux-x64-musl/**',
      '**/node_modules/@swc/core-darwin-x64/**',
      '**/node_modules/@swc/core-darwin-arm64/**',
      '**/node_modules/@swc/core-win32-x64-msvc/**',
      '**/node_modules/@esbuild/**',
      '**/node_modules/typescript/**',
      '**/node_modules/@biomejs/**',
      '**/node_modules/@playwright/**',
      '**/node_modules/vitest/**',
      '**/node_modules/@vitest/**',
      '**/node_modules/@testing-library/**',
      '**/node_modules/jsdom/**',
      '**/node_modules/@parcel/watcher/**',
      '**/node_modules/pino-pretty/**',
      '**/node_modules/.pnpm/@swc+core-darwin*/**',
      '**/node_modules/.pnpm/@swc+core-win32*/**',
      '**/node_modules/.pnpm/@parcel+watcher*/**',
      '**/node_modules/.pnpm/esbuild*/**',
      '**/node_modules/.pnpm/pino-pretty*/**',
      '**/__tests__/**',
      '**/.storybook/**',
      '**/docs/**',
    ],
  },

  // TypeScript configuration
  typescript: {
    // Ignore TypeScript errors during build (errors are in test files which are excluded)
    ignoreBuildErrors: false, // Set to true if needed, but test files are now excluded
  },

  // ESLint configuration
  eslint: {
    // Ignore ESLint errors during build
    ignoreDuringBuilds: false,
  },

  // Enable experimental features for better performance
  experimental: {
    optimizeCss: true,
    scrollRestoration: true,
  },

  // Optimize bundle splitting and tree-shaking
  webpack: (config, { dev, isServer }) => {
    // Disable React error overlay
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'react-error-overlay': false,
      }
      // Also disable error overlay via webpack plugins
      config.plugins = config.plugins || []
      config.plugins = config.plugins.filter(
        (plugin) => plugin.constructor.name !== 'ReactRefreshPlugin' || !dev
      )
    }
    return config
  },

  // Configure images
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
    unoptimized: process.env.NODE_ENV === 'development',
  },

  // Configure headers for security (Bank-grade security)
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/:path*',
        headers: [
          // SECURITY: Prevent Referrer leakage to external sites
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // SECURITY: Prevent MIME type sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // SECURITY: Enable XSS protection (allow iframe embedding from upswitch.app)
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          // SECURITY: Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.upswitch.app wss://*.upswitch.app",
              "frame-ancestors 'self' https://upswitch.app https://*.upswitch.app",
              "form-action 'self'",
              "base-uri 'self'",
            ].join('; '),
          },
          // SECURITY: Permissions Policy (formerly Feature-Policy)
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(), microphone=(), camera=()',
          },
          // SECURITY: Strict Transport Security (HSTS)
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ]
  },

  // Configure rewrites for API routes
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: '/api/:path*',
      },
    ]
  },

  // Bundle analyzer configuration
  ...(process.env.ANALYZE === 'true' && {
    webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
      if (!dev && !isServer) {
        config.plugins.push(
          new webpack.DefinePlugin({
            __BUNDLE_ANALYZE__: JSON.stringify(true),
          })
        )
      }
      return config
    },
  }),
}

export default withNextIntl(nextConfig)
