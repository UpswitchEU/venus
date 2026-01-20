export interface LoadingStep {
  text: string
  subtext: string
  estimatedMs?: number // Estimated duration in milliseconds
}

/**
 * Access verification steps - used for new report initialization
 * 
 * These steps are shown when bootstrap detects a new report (mode: 'new').
 * They guide users through the initial setup process for creating a new valuation.
 * 
 * @see useLoadingSteps - Hook that automatically selects between RESTORATION_STEPS and INITIALIZATION_STEPS
 */
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

/**
 * Restoration steps - used when loading existing reports with valuation results
 * 
 * These steps are shown when bootstrap detects a COMPLETED report (mode: 'existing' + hasValuationResult).
 * They provide clear visual feedback that the system is restoring a completed valuation.
 * 
 * @see useLoadingSteps - Hook that automatically selects the appropriate steps
 */
export const RESTORATION_STEPS: LoadingStep[] = [
  {
    text: 'Restoring valuation',
    subtext: 'Loading your completed report...',
    estimatedMs: 800,
  },
  {
    text: 'Preparing results',
    subtext: 'Reconstructing valuation breakdown...',
    estimatedMs: 600,
  },
  {
    text: 'Finalizing report',
    subtext: 'Preparing your report for viewing...',
    estimatedMs: 500,
  },
]

/**
 * Draft restoration steps - used when loading in-progress reports without valuation results
 * 
 * These steps are shown when bootstrap detects a DRAFT report (mode: 'existing' + hasExistingData + !hasValuationResult).
 * They provide clear visual feedback that the system is restoring an in-progress valuation.
 */
export const DRAFT_RESTORATION_STEPS: LoadingStep[] = [
  {
    text: 'Restoring draft',
    subtext: 'Loading your saved progress...',
    estimatedMs: 600,
  },
  {
    text: 'Recovering form data',
    subtext: 'Restoring your inputs...',
    estimatedMs: 600,
  },
  {
    text: 'Preparing workspace',
    subtext: 'Setting up where you left off...',
    estimatedMs: 400,
  },
]

// Keep old exports for backwards compatibility - both now point to unified steps
// This ensures consistent loading experience during initialization and calculation
export const INITIALIZATION_STEPS = ACCESS_VERIFICATION_STEPS // Use access steps for initialization
export const GENERATION_STEPS = UNIFIED_LOADING_STEPS

// ✅ WORLD CLASS: LoadingStep interface is already exported above (line 1)
// This ensures consistent loading steps across Mercury and Venus
// Mercury can import LoadingStep interface to match Venus loading experience exactly
