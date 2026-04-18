/**
 * Cross-app `postMessage` envelope types emitted by the valuation engine
 * (this app) and consumed by Mercury when the engine is rendered inside the
 * Mercury embedded modal iframe.
 *
 * These literals are part of a CROSS-APP RUNTIME CONTRACT. They are not
 * user-visible (they ride inside `MessageEvent.data.type` between two
 * trusted origins), but renaming any of them on one side without the other
 * will silently break the embedded report flow:
 *
 *   - `engineReady` → Mercury hides the loading skeleton and reveals the
 *     iframe.
 *   - `engineClose` → Mercury closes the modal.
 *   - `valuationComplete` → Mercury invalidates report queries and shows a
 *     success toast.
 *   - `reportCreated` → Mercury swaps the iframe `reportId` to the engine-
 *     issued one and refreshes derived queries.
 *
 * The legacy `venus-*` literals are retained as the actual wire values so
 * deploys can roll out independently. If you rename one of these values,
 * update BOTH `apps/venus/src/constants/crossAppMessages.ts` AND
 * `apps/mercury/shared/constants/cross-app-messages.ts` AND both contract-
 * lock tests in the same change set, then deploy them together.
 *
 * The corresponding Mercury-side consumer constants live at:
 *   `apps/mercury/shared/constants/cross-app-messages.ts`.
 */

export const ENGINE_TO_MERCURY_MESSAGE_TYPES = {
  /** Engine has fully bootstrapped and is ready for user interaction. */
  engineReady: 'venus-ready',
  /** Engine wants Mercury to dismiss the embedding modal. */
  engineClose: 'venus-close',
  /** A full valuation result has been computed and persisted. */
  valuationComplete: 'venus-valuation-complete',
  /** A new report ID was minted server-side; Mercury should swap to it. */
  reportCreated: 'upswitch-report-created',
} as const

export type EngineToMercuryMessageType =
  (typeof ENGINE_TO_MERCURY_MESSAGE_TYPES)[keyof typeof ENGINE_TO_MERCURY_MESSAGE_TYPES]
