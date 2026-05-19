import { ApplicationError } from '../../types/errors'
import { getApiUrl } from '../../utils/getMercuryUrl'
import { createContextLogger } from '../../utils/logger'

const logger = createContextLogger('SessionPlanEnforcement')
const PLAN_ENFORCEMENT_TIMEOUT = 5000

type PaywallApplicationError = ApplicationError & {
  isPaywallError: true
  current?: number
  limit?: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function markAsPaywallError(
  error: ApplicationError,
  current?: number,
  limit?: number
): PaywallApplicationError {
  const paywallError = error as PaywallApplicationError
  paywallError.isPaywallError = true
  paywallError.current = current
  paywallError.limit = limit
  return paywallError
}

function isPaywallApplicationError(error: unknown): error is PaywallApplicationError {
  return (
    error instanceof ApplicationError &&
    (error as { isPaywallError?: unknown }).isPaywallError === true
  )
}

/**
 * Bank-grade valuation creation guard:
 * - specific paywall errors for plan limits
 * - graceful degradation for infrastructure failures
 * - hard timeout so session creation never hangs on billing policy
 */
export async function checkValuationCreationAllowed(): Promise<void> {
  const checkStartTime = performance.now()

  try {
    const baseURL = getApiUrl()
    const url = `${baseURL}/api/v2/billing/plan-enforcement/check?usage_type=VALUATION`

    logger.debug('Checking valuation creation limit', { url, timeout: PLAN_ENFORCEMENT_TIMEOUT })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PLAN_ENFORCEMENT_TIMEOUT)

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const checkTime = performance.now() - checkStartTime

      if (!response.ok) {
        logger.warn('Plan enforcement check failed, allowing creation (graceful degradation)', {
          status: response.status,
          statusText: response.statusText,
          checkTime_ms: checkTime.toFixed(2),
        })
        return
      }

      const result = asRecord(await response.json())
      const allowed = result?.allowed === true
      const current = optionalNumber(result?.current)
      const limit = optionalNumber(result?.limit)
      const reason = optionalString(result?.reason)
      const message = optionalString(result?.message)

      logger.debug('Plan enforcement check result', {
        allowed,
        current,
        limit,
        checkTime_ms: checkTime.toFixed(2),
      })

      if (!allowed) {
        logger.warn('Valuation creation blocked by plan enforcement', {
          current,
          limit,
          reason,
          message,
        })

        const error = new ApplicationError(
          message ||
            'Valuation limit reached. Upgrade to Starter or higher for unlimited valuations.',
          'PAYWALL_VALUATION_LIMIT',
          {
            current,
            limit,
            reason,
            upgradeUrl: '/pricing',
          }
        )

        throw markAsPaywallError(error, current, limit)
      }

      logger.debug('Valuation limit check passed', {
        current,
        limit,
        checkTime_ms: checkTime.toFixed(2),
      })
    } catch (fetchError) {
      clearTimeout(timeoutId)

      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        const checkTime = performance.now() - checkStartTime
        logger.warn('Plan enforcement check timed out, allowing creation (graceful degradation)', {
          timeout_ms: PLAN_ENFORCEMENT_TIMEOUT,
          elapsed_ms: checkTime.toFixed(2),
        })
        return
      }

      throw fetchError
    }
  } catch (error) {
    if (isPaywallApplicationError(error)) {
      throw error
    }

    const checkTime = performance.now() - checkStartTime
    logger.warn('Plan enforcement check error, allowing creation (graceful degradation)', {
      error: error instanceof Error ? error.message : 'Unknown error',
      checkTime_ms: checkTime.toFixed(2),
      stack: error instanceof Error ? error.stack : undefined,
    })
  }
}
