/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable React error overlay in production
  reactStrictMode: true,
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
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
    // Exclude vitest.config.ts from being processed by Next.js
    config.module.rules.push({
      test: /vitest\.config\.ts$/,
      loader: 'ignore-loader',
    })

    // Production optimizations
    if (!dev && !isServer) {
      // Enable webpack optimizations for better tree-shaking
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          minSize: 20000, // Minimum chunk size (20KB)
          maxSize: 244000, // Maximum chunk size (244KB) - helps with code splitting
          cacheGroups: {
            // Default vendor chunk
            default: {
              minChunks: 2,
              priority: -20,
              reuseExistingChunk: true,
            },
            // Vendor libraries
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
              priority: 10,
              minChunks: 1,
            },
            // React ecosystem (large, frequently used)
            react: {
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              name: 'react-vendor',
              chunks: 'all',
              priority: 20,
              enforce: true,
            },
            // UI libraries (can be lazy loaded)
            ui: {
              test: /[\\/]node_modules[\\/](lucide-react|framer-motion|@heroui)[\\/]/,
              name: 'ui-vendor',
              chunks: 'async', // Load on demand
              priority: 15,
            },
            // Heavy libraries (lazy load)
            heavy: {
              test: /[\\/]node_modules[\\/](recharts|html2pdf|dompurify|axios)[\\/]/,
              name: 'heavy-vendor',
              chunks: 'async', // Load on demand
              priority: 12,
            },
            // Feature modules - conversational flow
            conversational: {
              test: /src[\\/]features[\\/]conversational[\\/]/,
              name: 'conversational-feature',
              chunks: 'async',
              priority: 8,
            },
            // Feature modules - manual flow
            manual: {
              test: /src[\\/]features[\\/]manual[\\/]/,
              name: 'manual-feature',
              chunks: 'async',
              priority: 8,
            },
            // Streaming chat feature
            streaming: {
              test: /src[\\/]components[\\/]StreamingChat/,
              name: 'streaming-feature',
              chunks: 'async',
              priority: 7,
            },
            // Utility modules
            utils: {
              test: /src[\\/]utils[\\/]/,
              name: 'utils',
              chunks: 'all',
              priority: 5,
              minChunks: 2,
            },
            // Store modules
            store: {
              test: /src[\\/]store[\\/]/,
              name: 'store',
              chunks: 'all',
              priority: 6,
            },
          },
        },
        // Enable more aggressive minification
        minimize: true,
        // Enable module concatenation for better tree-shaking
        concatenateModules: true,
        // Enable side effects optimization
        sideEffects: false,
      }
    }

    return config
  },

  // Configure images
  images: {
    domains: ['localhost'],
    unoptimized: process.env.NODE_ENV === 'development',
  },

  // Configure headers for security
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
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

export default nextConfig
