/**
 * Promise cache for initialization - prevents multiple simultaneous initializations.
 * Once initialization succeeds, initCompleted prevents re-running.
 */
let initPromise: Promise<void> | null = null
let initCompleted = false
let currentTraceId: string | null = null

export function getInitPromise(): Promise<void> | null {
  return initPromise
}

export function setInitPromise(promise: Promise<void> | null): void {
  initPromise = promise
}

export function isInitCompleted(): boolean {
  return initCompleted
}

export function setInitCompleted(completed: boolean): void {
  initCompleted = completed
}

export function resetAuthInitializationRuntime(): void {
  initCompleted = false
  initPromise = null
}

export function setInitTraceId(traceId: string | null): void {
  currentTraceId = traceId
}

export function getInitTraceId(): string | null {
  return currentTraceId
}
