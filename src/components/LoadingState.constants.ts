export interface LoadingStep {
  text: string
  subtext: string
}

// Unified loading steps - used for all loading states across the app
// This provides a consistent, professional cloud-infrastructure messaging
// that aligns with SaaS positioning and reduces cognitive load
export const UNIFIED_LOADING_STEPS: LoadingStep[] = [
  {
    text: 'Connecting to secure cloud...',
    subtext: 'Establishing encrypted connection to Upswitch servers',
  },
  {
    text: 'Initializing valuation engine...',
    subtext: 'Loading financial modeling tools and market data',
  },
  {
    text: 'Preparing workspace...',
    subtext: 'Setting up your secure valuation environment',
  },
]

// Keep old exports for backwards compatibility - both now point to unified steps
// This ensures consistent loading experience during initialization and calculation
export const INITIALIZATION_STEPS = UNIFIED_LOADING_STEPS
export const GENERATION_STEPS = UNIFIED_LOADING_STEPS
