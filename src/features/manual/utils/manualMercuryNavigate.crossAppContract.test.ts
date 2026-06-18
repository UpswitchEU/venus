// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { ENGINE_TO_MERCURY_MESSAGE_TYPES } from '@/constants/crossAppMessages'
import { resolveMercuryNavigationPathForEmbed } from './manualMercuryNavigate'
import { buildManualContinueToListingUrl } from './manualMercuryNavigation'

/**
 * Cross-app contract: seller Doorgaan / exit must target Mercury business dashboard
 * with celebration marker — parent `router.push` receives this path shape.
 */
describe('manualMercuryNavigate cross-app contract', () => {
  it('seller Doorgaan resolves to business dashboard embed path with celebration', () => {
    const targetUrl = buildManualContinueToListingUrl({
      mercuryUrl: 'https://preview.upswitch.app',
      locale: 'nl',
      returnUrl: 'https://preview.upswitch.app/nl/business/dashboard?phase=valuation',
      sourceApp: 'business_dashboard_orphaned_seller',
      hasCompletedValuation: true,
    })

    const path = resolveMercuryNavigationPathForEmbed(targetUrl, 'https://preview.upswitch.app')
    expect(path).toBe('/nl/business/dashboard?from=valuation')
    expect(path).not.toContain('phase=valuation')
    expect(path).not.toContain('/advisor/')
  })

  it('navigateToMercury wire token matches Mercury consumer', () => {
    expect(ENGINE_TO_MERCURY_MESSAGE_TYPES.navigateToMercury).toBe('venus-navigate-mercury')
  })
})
