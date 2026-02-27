import type { Config } from 'tailwindcss'

/**
 * Hybrid Aurora Design System - Tailwind Preset
 *
 * Usage:
 * ```typescript
 * // tailwind.config.ts
 * import { hybridAuroraPreset } from './src/design-system/tailwind.preset';
 *
 * export default {
 *   presets: [hybridAuroraPreset],
 *   content: [...],
 * } satisfies Config;
 * ```
 */
export const hybridAuroraPreset: Partial<Config> = {
  darkMode: ['class'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      // ─────────────────────────────────────────
      // TYPOGRAPHY
      // ─────────────────────────────────────────
      fontFamily: {
        sans: [
          'Satoshi',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        display: ['Satoshi', 'system-ui', 'sans-serif'],
        mono: [
          'JetBrains Mono',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'Courier New',
          'monospace',
        ],
      },

      // ─────────────────────────────────────────
      // COLORS - Semantic Tokens
      // ─────────────────────────────────────────
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },

        // ─────────────────────────────────────────
        // BRAND PALETTE (Direct usage)
        // ─────────────────────────────────────────

        // Primary: Aurora Teal (30%)
        teal: {
          DEFAULT: '#3DBDB0',
          50: '#E8F8F7',
          100: '#D1F1EF',
          200: '#A3E3DF',
          300: '#75D5CF',
          400: '#4CC7BF',
          500: '#3DBDB0',
          600: '#319A8F',
          700: '#25776E',
          800: '#19544D',
          900: '#0D312C',
        },

        // Secondary: Burnt Clay (10%)
        clay: {
          DEFAULT: '#C87F63',
          50: '#FAF0EC',
          100: '#F5E1D9',
          200: '#EBC3B3',
          300: '#E1A58D',
          400: '#D79278',
          500: '#C87F63',
          600: '#B86A4E',
          700: '#9A5840',
          800: '#7C4733',
          900: '#5E3627',
        },

        // Accent: Aurora Violet (atmosphere)
        violet: {
          DEFAULT: '#8B5CF6',
          50: '#F3EFFE',
          100: '#E7DFFD',
          200: '#CFBFFB',
          300: '#B79FF9',
          400: '#9F7FF7',
          500: '#8B5CF6',
          600: '#6D3AE8',
          700: '#5521D0',
          800: '#4118A8',
          900: '#2E1180',
        },

        // Canvas: Deep Slate (60%)
        slate: {
          DEFAULT: '#161A22',
          50: '#F5F6F7',
          100: '#EBECED',
          200: '#D2D4D8',
          300: '#A8ACB4',
          400: '#6B7280',
          500: '#4B5563',
          600: '#374151',
          700: '#2B303A',
          800: '#1C2028',
          900: '#161A22',
        },
      },

      // ─────────────────────────────────────────
      // BORDER RADIUS
      // ─────────────────────────────────────────
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
        '3xl': 'calc(var(--radius) + 16px)',
      },

      // ─────────────────────────────────────────
      // SPACING
      // ─────────────────────────────────────────
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '30': '7.5rem',
      },

      // ─────────────────────────────────────────
      // DISPLAY TYPOGRAPHY
      // ─────────────────────────────────────────
      fontSize: {
        'display-2xl': ['4rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-xl': ['3rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-lg': [
          '2.25rem',
          { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '600' },
        ],
        'display-md': [
          '1.875rem',
          { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' },
        ],
        'display-sm': ['1.5rem', { lineHeight: '1.4', fontWeight: '600' }],
      },

      // ─────────────────────────────────────────
      // ANIMATIONS
      // ─────────────────────────────────────────
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-out': {
          from: { opacity: '1', transform: 'translateY(0)' },
          to: { opacity: '0', transform: 'translateY(10px)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'fade-out': 'fade-out 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'scale-in': 'scale-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'slide-up': 'slide-up 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'slide-down': 'slide-down 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        shimmer: 'shimmer 1.5s infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        float: 'float 3s ease-in-out infinite',
      },

      // ─────────────────────────────────────────
      // SHADOWS
      // ─────────────────────────────────────────
      boxShadow: {
        'mercury-sm': '0 1px 2px hsl(var(--shadow-color))',
        mercury: '0 1px 3px hsl(var(--shadow-color)), 0 4px 12px hsl(var(--shadow-color))',
        'mercury-lg': '0 4px 6px hsl(var(--shadow-color)), 0 10px 24px hsl(var(--shadow-color))',
        'mercury-xl': '0 8px 16px hsl(var(--shadow-color)), 0 20px 40px hsl(var(--shadow-color))',
        'glow-primary': '0 0 20px hsl(var(--shadow-glow-primary))',
        'glow-accent': '0 0 20px hsl(var(--shadow-glow-accent))',
        'glow-secondary': '0 0 20px hsl(var(--shadow-glow-secondary))',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default hybridAuroraPreset
