import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'cypress', 'e2e/**', 'tests/e2e/**'],
    // Narrow filter: zustand-persist + Framer layout work can log one benign
    // React act() line in jsdom while assertions still prove correct behavior.
    onConsoleLog(log: string, type: 'stderr' | 'stdout') {
      if (
        type === 'stderr' &&
        log.includes('not wrapped in act') &&
        (log.includes('StartupValuationPanel') || log.includes('SegmentedControl'))
      ) {
        return false
      }
      return true
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/__tests__/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        '**/*.mock.*',
      ],
    },
  },
  resolve: {
    alias: {
      '@/app': path.resolve(__dirname, './app'),
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/lib': path.resolve(__dirname, './src/lib'),
      '@/utils': path.resolve(__dirname, './src/utils'),
      '@/types': path.resolve(__dirname, './src/types'),
      '@upswitch/ai-actions': path.resolve(__dirname, './vendor/ai-actions/dist/index.js'),
      '@upswitch/ai-dock-shells': path.resolve(__dirname, './vendor/ai-dock-shells/src/index.ts'),
      '@upswitch/business-type-selector': path.resolve(
        __dirname,
        './vendor/business-type-selector/src/index.ts'
      ),
      '@upswitch/types/valuation-methods': path.resolve(
        __dirname,
        '../../packages/types/src/valuation-methods.ts'
      ),
      '@upswitch/types/normalization': path.resolve(
        __dirname,
        '../../packages/types/src/normalization.ts'
      ),
      '@upswitch/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
    },
  },
})
