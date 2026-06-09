import { isPdfTransientUpstreamStatus } from '@/utils/pdfTransientUpstream'
import {
  isTransientUpstreamFailure,
  shouldRetryTransientBffResponse,
  TRANSIENT_UPSTREAM_MESSAGE,
} from '@/utils/transientUpstreamMessage'

export { TRANSIENT_UPSTREAM_MESSAGE, isTransientUpstreamFailure, shouldRetryTransientBffResponse }

export function isTransientUpstreamStatus(status: number): boolean {
  return isPdfTransientUpstreamStatus(status)
}

export function transientUpstreamFailureBody() {
  return { success: false, message: TRANSIENT_UPSTREAM_MESSAGE }
}
