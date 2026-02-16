import containerQueries from '@tailwindcss/container-queries'
import forms from '@tailwindcss/forms'
import type { Config } from 'tailwindcss'
import { hybridAuroraPreset } from './src/design-system/tailwind.preset'

const config: Config = {
  presets: [hybridAuroraPreset as Config],
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // ═══════════════════════════════════════════════════════
      // AURORA DESIGN SYSTEM - Font Families
      // ═══════════════════════════════════════════════════════
      fontFamily: {
        // Aurora Design System — Satoshi as primary
        sans: ['Satoshi', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Satoshi', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace'],
        // Legacy aliases
        'aurora': ['Satoshi', 'system-ui', '-apple-system', 'sans-serif'],
        'aurora-mono': ['JetBrains Mono', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        // ═══════════════════════════════════════════════════════
        // AURORA DESIGN SYSTEM - HSL-based semantic colors
        // Use these for new components with .aurora-theme class
        // ═══════════════════════════════════════════════════════
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        gold: {
          DEFAULT: 'hsl(var(--gold))',
          foreground: 'hsl(var(--gold-foreground))',
        },
        // Aurora brand colors (direct values for charts/illustrations)
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
        // ═══════════════════════════════════════════════════════
        // LEGACY UPSWITCH BRAND COLORS (keep for backward compatibility)
        // ═══════════════════════════════════════════════════════
        // Upswitch Brand Colors - Aurora Teal Primary
        primary: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#4ECBB0',
          500: '#3DBDB0',
          600: '#358F84', // Aurora Teal
          700: '#2D756D',
          800: '#255C57',
          900: '#1E4A46',
          DEFAULT: '#3DBDB0',
        },
        // Accent - Burnt Clay
        accent: {
          50: '#FBF6F4',
          100: '#F6EBE7',
          200: '#EBD6CE',
          300: '#DEBDB0',
          400: '#D09F8E',
          500: '#C87F63', // Burnt Clay
          600: '#B3684D',
          700: '#96533C',
          800: '#7A4433',
          900: '#63392D',
          DEFAULT: '#C87F63',
        },
        // Backgrounds
        canvas: {
          DEFAULT: '#F4F1EA', // Canvas
          50: '#FCFBF9',
          100: '#F4F1EA',
          200: '#EAE5DB',
        },
        // Text
        slate: {
          ink: '#2B303A', // Slate Ink
        },
        // Functional Status Colors - Earthen Functional Tones (Verified)
        rust: {
          DEFAULT: '#B85C56', // Rust - Error/Critical
          tint: '#F5EBEA', // Rust Tint - Error backgrounds
          50: '#F5EBEA',
          100: '#E8D5D3',
          200: '#D4B0AD',
          300: '#C08B87',
          400: '#B85C56',
          500: '#B85C56',
          600: '#A04A44',
          700: '#883D38',
          800: '#70302C',
          900: '#582320',
        },
        moss: {
          DEFAULT: '#6B8E72', // Moss - Success/Valid
          tint: '#E9F0EB', // Moss Tint - Success backgrounds
          50: '#E9F0EB',
          100: '#D3E1D7',
          200: '#A7C3AF',
          300: '#7BA587',
          400: '#6B8E72',
          500: '#6B8E72',
          600: '#5A7A5F',
          700: '#49664C',
          800: '#385239',
          900: '#273E26',
        },
        harvest: {
          DEFAULT: '#D9A558', // Harvest - Warning/Pending
          tint: '#FAF5EB', // Harvest Tint - Warning backgrounds
          50: '#FAF5EB',
          100: '#F5EBD7',
          200: '#EBD7AF',
          300: '#E1C387',
          400: '#D9A558',
          500: '#D9A558',
          600: '#C89447',
          700: '#B78336',
          800: '#A67225',
          900: '#956114',
        },
        river: {
          DEFAULT: '#6B8594', // River - Information/Links
          50: '#E8EDF0',
          100: '#D1DBE1',
          200: '#A3B7C3',
          300: '#7593A5',
          400: '#6B8594',
          500: '#6B8594',
          600: '#5A717D',
          700: '#495D66',
          800: '#38494F',
          900: '#273538',
        },
        // Stone Neutral Scale - Warm Greys
        stone: {
          100: '#EBE7DE', // Dividers & Borders
          200: '#DCD8CE', // Input Fields
          300: '#C2BDB3', // Disabled States
          500: '#85827A', // Secondary Text
        },
        // Legacy aliases for backward compatibility (using new colors)
        success: {
          DEFAULT: '#6B8E72', // Moss
          50: '#E9F0EB', // Moss Tint
          500: '#6B8E72',
          600: '#5A7A5F',
        },
        warning: {
          DEFAULT: '#D9A558', // Harvest
          50: '#FAF5EB', // Harvest Tint
          500: '#D9A558',
          600: '#C89447',
        },
        error: {
          DEFAULT: '#B85C56', // Rust
          50: '#F5EBEA', // Rust Tint
          500: '#B85C56',
          600: '#A04A44',
        },
      },
      // ═══════════════════════════════════════════════════════
      // AURORA DESIGN SYSTEM - Border Radius
      // ═══════════════════════════════════════════════════════
      borderRadius: {
        DEFAULT: '8px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
        '3xl': 'calc(var(--radius) + 16px)',
      },
      // ═══════════════════════════════════════════════════════
      // AURORA DESIGN SYSTEM - Box Shadows
      // ═══════════════════════════════════════════════════════
      boxShadow: {
        elevated: '0 12px 24px -6px rgba(74, 93, 79, 0.15)',
        'mercury-sm': '0 1px 2px hsl(var(--shadow-color))',
        'mercury': '0 1px 3px hsl(var(--shadow-color)), 0 4px 12px hsl(var(--shadow-color))',
        'mercury-lg': '0 4px 6px hsl(var(--shadow-color)), 0 10px 24px hsl(var(--shadow-color))',
        'mercury-xl': '0 8px 16px hsl(var(--shadow-color)), 0 20px 40px hsl(var(--shadow-color))',
      },
      // ═══════════════════════════════════════════════════════
      // AURORA DESIGN SYSTEM - Keyframes
      // ═══════════════════════════════════════════════════════
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'aurora-fade-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'aurora-fade-out': {
          from: { opacity: '1', transform: 'translateY(0)' },
          to: { opacity: '0', transform: 'translateY(10px)' },
        },
        'aurora-scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'aurora-slide-up': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'aurora-slide-down': {
          from: { opacity: '0', transform: 'translateY(-20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'aurora-shimmer': {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
      },
      // ═══════════════════════════════════════════════════════
      // AURORA DESIGN SYSTEM - Animations
      // ═══════════════════════════════════════════════════════
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'aurora-fade-in': 'aurora-fade-in 0.4s ease-out forwards',
        'aurora-fade-out': 'aurora-fade-out 0.3s ease-out forwards',
        'aurora-scale-in': 'aurora-scale-in 0.3s ease-out forwards',
        'aurora-slide-up': 'aurora-slide-up 0.5s ease-out forwards',
        'aurora-slide-down': 'aurora-slide-down 0.5s ease-out forwards',
        'aurora-shimmer': 'aurora-shimmer 1.5s infinite',
      },
    },
  },
  darkMode: 'class',
  plugins: [
    containerQueries,
    forms,
  ],
}

export default config
