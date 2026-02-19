// 🎨 Aurora by Upswitch Design System Theme
// Clarity-aligned: Aurora Teal primary, Burnt Clay accent, Deep Slate canvas

export const BrandColors = {
  // Primary: Aurora Teal (30% - tech-forward)
  primary: {
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
    DEFAULT: '#3DBDB0',
  },

  // Accent (Burnt Clay)
  accent: {
    50: '#FBF6F4',
    100: '#F6EBE7',
    200: '#EBD6CE',
    300: '#DEBDB0',
    400: '#D09F8E',
    500: '#C87F63', // Burnt Clay - Accent
    600: '#B3684D',
    700: '#96533C',
    800: '#7A4433',
    900: '#63392D',
    DEFAULT: '#C87F63',
  },

  // Background (Canvas)
  canvas: {
    50: '#FCFBF9',
    100: '#F4F1EA', // Canvas - Default
    200: '#EAE5DB',
    DEFAULT: '#F4F1EA',
  },

  // Text (Slate Ink)
  slate: {
    ink: '#2B303A', // Slate Ink - Primary Text
    DEFAULT: '#2B303A',
  },

  // Neutral — warmed slightly for comfort
  neutral: {
    50: '#ffffff',
    100: '#f9fafb',
    200: '#f3f4f6',
    300: '#e5e7eb',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827', // Keep standard dark for deep contrast if needed
    950: '#000000',
    DEFAULT: '#111827',
  },

  // Semantic colors
  success: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
    DEFAULT: '#22c55e',
  },

  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
    DEFAULT: '#f59e0b',
  },

  error: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
    DEFAULT: '#ef4444',
  },

  // Business/Finance specific (Clarity Aurora)
  business: {
    trust: '#3DBDB0', // Aurora Teal
    growth: '#059669',
    premium: '#C87F63', // Burnt Clay
    secure: '#2B303A', // Slate Ink
  },
} as const

export const Typography = {
  fontFamily: {
    sans: [
      'Inter',
      'system-ui',
      '-apple-system',
      'BlinkMacSystemFont',
      'Segoe UI',
      'Roboto',
      'sans-serif',
    ],
    display: ['Inter', 'system-ui', 'sans-serif'],
  },
  fontSize: {
    xs: ['0.75rem', { lineHeight: '1.125rem' }],
    sm: ['0.875rem', { lineHeight: '1.375rem' }],
    base: ['1rem', { lineHeight: '1.625rem' }],
    lg: ['1.125rem', { lineHeight: '1.75rem' }],
    xl: ['1.25rem', { lineHeight: '1.85rem' }],
    '2xl': ['1.5rem', { lineHeight: '2rem' }],
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
    '4xl': ['2.25rem', { lineHeight: '2.6rem' }],
    '5xl': ['3rem', { lineHeight: '1' }],
  },
} as const

export const BorderRadius = {
  none: '0',
  sm: '0.25rem',
  DEFAULT: '0.5rem',
  md: '0.625rem',
  lg: '0.75rem',
  xl: '1rem',
  '2xl': '1.25rem',
  '3xl': '1.5rem',
  full: '9999px',
} as const

export default {
  colors: BrandColors,
  typography: Typography,
  borderRadius: BorderRadius,
} as const
