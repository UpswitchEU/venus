export const STARTUP_SUBMIT_REVIEW_REQUEST_EVENT = 'upswitch:startup-submit-review-request'

export type StartupSubmitReviewRequestOutcome = 'opened' | 'blocked' | 'unavailable'

export interface StartupSubmitReviewRequestOptions {
  onWillSubmit?: () => void
}

export interface StartupSubmitReviewRequestDetail extends StartupSubmitReviewRequestOptions {
  respond?: (outcome: StartupSubmitReviewRequestOutcome) => void
}

export function requestStartupSubmitReview(
  options: StartupSubmitReviewRequestOptions = {}
): StartupSubmitReviewRequestOutcome {
  if (typeof window === 'undefined') return 'unavailable'

  let outcome: StartupSubmitReviewRequestOutcome = 'unavailable'
  window.dispatchEvent(
    new CustomEvent<StartupSubmitReviewRequestDetail>(STARTUP_SUBMIT_REVIEW_REQUEST_EVENT, {
      detail: {
        ...options,
        respond: (nextOutcome) => {
          outcome = nextOutcome
        },
      },
    })
  )
  return outcome
}

export function getStartupSubmitReviewRequestDetail(
  event: Event
): StartupSubmitReviewRequestDetail | null {
  if (event.type !== STARTUP_SUBMIT_REVIEW_REQUEST_EVENT) return null
  const detail = (event as CustomEvent<StartupSubmitReviewRequestDetail>).detail
  return detail && typeof detail === 'object' ? detail : {}
}
