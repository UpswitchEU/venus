export interface LoadingStep {
  text: string
  subtext: string
  estimatedMs?: number // Estimated duration in milliseconds
}

// Access verification steps - specifically for accountant client context loading
export const ACCESS_VERIFICATION_STEPS: LoadingStep[] = [
  {
    text: 'Validating access',
    subtext: 'Checking your permissions...',
    estimatedMs: 500,
  },
  {
    text: 'Creating session',
    subtext: 'Setting up secure workspace...',
    estimatedMs: 1500,
  },
  {
    text: 'Loading valuation engine',
    subtext: 'Preparing financial tools...',
    estimatedMs: 1000,
  },
]

// Unified loading steps - used for all loading states across the app
// This provides a consistent, professional cloud-infrastructure messaging
// that aligns with SaaS positioning and reduces cognitive load
export const UNIFIED_LOADING_STEPS: LoadingStep[] = [
  {
    text: 'Connecting to secure cloud...',
    subtext: 'Establishing encrypted connection to Upswitch servers',
    estimatedMs: 1000,
  },
  {
    text: 'Initializing valuation engine...',
    subtext: 'Loading financial modeling tools and market data',
    estimatedMs: 1500,
  },
  {
    text: 'Preparing workspace...',
    subtext: 'Setting up your secure valuation environment',
    estimatedMs: 500,
  },
]

// Keep old exports for backwards compatibility - both now point to unified steps
// This ensures consistent loading experience during initialization and calculation
export const INITIALIZATION_STEPS = ACCESS_VERIFICATION_STEPS // Use access steps for initialization
export const GENERATION_STEPS = UNIFIED_LOADING_STEPS
