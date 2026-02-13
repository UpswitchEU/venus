import { heroui } from '@heroui/theme'
import containerQueries from '@tailwindcss/container-queries'
import forms from '@tailwindcss/forms'
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/@heroui/theme/dist/components/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Upswitch Brand Colors - Sage Foundation Primary
        primary: {
          50: '#F2F5F3',
          100: '#E1E8E3',
          200: '#C4D1C9',
          300: '#A2B6A9',
          400: '#7E9888',
          500: '#607C6B',
          600: '#4A5D4F', // Sage Foundation
          700: '#3D4D41',
          800: '#323E35',
          900: '#28312B',
          DEFAULT: '#4A5D4F',
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
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['DM Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        elevated: '0 12px 24px -6px rgba(74, 93, 79, 0.15)', // Updated to Sage shadow
      },
    },
  },
  darkMode: 'class',
  plugins: [
    containerQueries,
    forms,
    heroui({
      defaultTheme: 'light',
      themes: {
        light: {
          colors: {
            primary: {
              DEFAULT: '#4A5D4F', // Sage Foundation
              foreground: '#ffffff',
            },
            secondary: {
              DEFAULT: '#C87F63', // Burnt Clay
              foreground: '#ffffff',
            },
            background: '#F4F1EA', // Canvas
            foreground: '#2B303A', // Slate Ink
          },
        },
      },
    }),
  ],
}

export default config
