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
    // Default: enabled. Set NEXT_PUBLIC_ENABLE_STREAMING=false to disable.
    enabled: process.env.NEXT_PUBLIC_ENABLE_STREAMING !== 'false',
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
// NOTE: AI is powered by Claude (Anthropic) via Titan API backend.
// Venus does not call AI directly - all AI interactions go through Titan.
export const AI_CONFIG = {
  // Default: enabled. Set each var to 'false' to individually disable.
  enabled: process.env.NEXT_PUBLIC_AI_ENHANCED_MODE !== 'false',
  // Model is configured in Titan (claude-3-5-sonnet-20241022)
  model: 'claude-3-5-sonnet',
  showReasoning: process.env.NEXT_PUBLIC_SHOW_AI_REASONING !== 'false',
  showHelpText: process.env.NEXT_PUBLIC_SHOW_AI_HELP_TEXT !== 'false',
  showNarratives: process.env.NEXT_PUBLIC_SHOW_VALUATION_NARRATIVES !== 'false',
  branding: {
    expertTitle: 'AI Valuation Expert',
    levelIndicator: 'Big 4 Level',
    showLevelBadge: process.env.NEXT_PUBLIC_SHOW_LEVEL_BADGE !== 'false',
  },
}
