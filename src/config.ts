import { env } from './utils/env'

// API Configuration
export const API_CONFIG = {
  baseURL:
    env.NEXT_PUBLIC_VALUATION_ENGINE_URL ||
    env.NEXT_PUBLIC_VALUATION_API_URL ||
    process.env.NEXT_PUBLIC_VALUATION_ENGINE_URL ||
    'https://api.valuations.upswitch.app',
  timeout: 30000,
  streaming: {
    enabled: process.env.NEXT_PUBLIC_ENABLE_STREAMING === 'true' || true,
    timeout: parseInt(process.env.NEXT_PUBLIC_STREAMING_TIMEOUT || '30000', 10),
    maxRetries: parseInt(process.env.NEXT_PUBLIC_MAX_RETRY_ATTEMPTS || '3', 10),
  },
}

// App Configuration
export const APP_CONFIG = {
  name: 'Upswitch Valuation Engine',
  version: '1.0.0-beta',
  environment: process.env.NODE_ENV || 'development',
}

// AI Agent Configuration
export const AI_CONFIG = {
  enabled: process.env.NEXT_PUBLIC_AI_ENHANCED_MODE === 'true' || true,
  model: process.env.NEXT_PUBLIC_OPENAI_MODEL || 'gpt-4o-mini',
  showReasoning: process.env.NEXT_PUBLIC_SHOW_AI_REASONING === 'true' || true,
  showHelpText: process.env.NEXT_PUBLIC_SHOW_AI_HELP_TEXT === 'true' || true,
  showNarratives: process.env.NEXT_PUBLIC_SHOW_VALUATION_NARRATIVES === 'true' || true,
  branding: {
    expertTitle: 'AI Valuation Expert',
    levelIndicator: 'Big 4 Level',
    showLevelBadge: process.env.NEXT_PUBLIC_SHOW_LEVEL_BADGE === 'true' || true,
  },
}
