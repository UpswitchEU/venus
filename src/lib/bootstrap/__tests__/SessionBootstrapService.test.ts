/**
 * SessionBootstrapService Tests
 *
 * AUTH-FIRST ARCHITECTURE: All tests assume authenticated users.
 * Guest flow has been removed from the platform.
 *
 * @module lib/bootstrap/__tests__/SessionBootstrapService
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionBootstrapService } from '../SessionBootstrapService'
import type { BootstrapContext, SessionBootstrapState } from '../types'

// Mock resolvers
const mockAuthResolver = {
  resolve: vi.fn(),
}

const mockSessionResolver = {
  resolve: vi.fn(),
}

const mockPrefillResolver = {
  resolve: vi.fn(),
}

describe('SessionBootstrapService', () => {
  let service: SessionBootstrapService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new SessionBootstrapService(
      mockAuthResolver as any,
      mockSessionResolver as any,
      mockPrefillResolver as any
    )
  })

  describe('bootstrap', () => {
    // AUTH-FIRST: Guest identity test removed - all users must authenticate
    it('should return authenticated identity for new user', async () => {
      const context: BootstrapContext = {
        reportId: 'val_123456789_vabc123',
        locale: 'en',
      }

      mockAuthResolver.resolve.mockResolvedValue({
        type: 'authenticated',
        userId: 'user-new-123',
      })

      mockSessionResolver.resolve.mockResolvedValue({
        mode: 'new',
        reportId: context.reportId,
        hasExistingData: false,
        status: 'draft',
      })

      mockPrefillResolver.resolve.mockResolvedValue({
        sources: [],
        confidence: 0,
        fieldsPopulated: [],
        fieldsRemaining: ['company_name', 'revenue'],
      })

      const result = await service.bootstrap(context)

      expect(result.identity.type).toBe('authenticated')
      expect(result.report.mode).toBe('new')
      expect(result.prefillData.confidence).toBe(0)
    })

    it('should return authenticated identity when user exists', async () => {
      const context: BootstrapContext = {
        reportId: 'val_123456789_vabc123',
        locale: 'en',
      }

      mockAuthResolver.resolve.mockResolvedValue({
        type: 'authenticated',
        userId: 'user-123',
        email: 'test@example.com',
      })

      mockSessionResolver.resolve.mockResolvedValue({
        mode: 'new',
        reportId: context.reportId,
        hasExistingData: false,
        status: 'draft',
      })

      mockPrefillResolver.resolve.mockResolvedValue({
        sources: ['user_profile'],
        companyInfo: { companyName: 'Test Corp' },
        confidence: 0.5,
        fieldsPopulated: ['company_name'],
        fieldsRemaining: ['revenue'],
      })

      const result = await service.bootstrap(context)

      expect(result.identity.type).toBe('authenticated')
      expect(result.identity.userId).toBe('user-123')
      expect(result.prefillData.sources).toContain('user_profile')
    })

    it('should return accountant_for_client identity when clientToken present', async () => {
      const context: BootstrapContext = {
        reportId: 'val_123456789_vabc123',
        clientToken: 'ct_abc123',
        locale: 'en',
      }

      mockAuthResolver.resolve.mockResolvedValue({
        type: 'accountant_for_client',
        userId: 'client-456',
        clientContext: {
          clientUserId: 'client-456',
          accountantUserId: 'accountant-789',
          relationshipId: 'rel-123',
          permissions: {
            canCreateValuations: true,
            canViewReports: true,
            canEditReports: true,
          },
        },
      })

      mockSessionResolver.resolve.mockResolvedValue({
        mode: 'new',
        reportId: context.reportId,
        hasExistingData: false,
        status: 'draft',
      })

      mockPrefillResolver.resolve.mockResolvedValue({
        sources: ['user_profile', 'kbo'],
        companyInfo: { companyName: 'Client Corp', kboNumber: '0123456789' },
        confidence: 0.8,
        fieldsPopulated: ['company_name', 'kbo_number'],
        fieldsRemaining: ['revenue'],
      })

      const result = await service.bootstrap(context)

      expect(result.identity.type).toBe('accountant_for_client')
      expect(result.identity.clientContext?.clientUserId).toBe('client-456')
      expect(result.identity.clientContext?.accountantUserId).toBe('accountant-789')
      expect(result.ui.showAccountantBanner).toBe(true)
    })

    it('should handle existing report mode', async () => {
      const context: BootstrapContext = {
        reportId: 'val_existing_123',
        locale: 'en',
      }

      mockAuthResolver.resolve.mockResolvedValue({
        type: 'authenticated',
        userId: 'user-123',
      })

      mockSessionResolver.resolve.mockResolvedValue({
        mode: 'existing',
        reportId: context.reportId,
        hasExistingData: true,
        status: 'active',
        currentStep: 3,
      })

      mockPrefillResolver.resolve.mockResolvedValue({
        sources: ['session'],
        companyInfo: { companyName: 'Existing Corp' },
        confidence: 0.9,
        fieldsPopulated: ['company_name', 'revenue', 'ebitda'],
        fieldsRemaining: [],
      })

      const result = await service.bootstrap(context)

      expect(result.report.mode).toBe('existing')
      expect(result.report.hasExistingData).toBe(true)
      expect(result.ui.showWelcomeBack).toBe(true)
      expect(result.ui.resumableSession).toBe(true)
    })

    it('should suggest conversational flow for low confidence', async () => {
      const context: BootstrapContext = {
        locale: 'en',
      }

      mockAuthResolver.resolve.mockResolvedValue({
        type: 'authenticated',
        userId: 'user-low-confidence',
      })

      mockSessionResolver.resolve.mockResolvedValue({
        mode: 'new',
        reportId: 'val_new_123',
        hasExistingData: false,
        status: 'draft',
      })

      mockPrefillResolver.resolve.mockResolvedValue({
        sources: [],
        confidence: 0.1, // Very low confidence
        fieldsPopulated: [],
        fieldsRemaining: ['company_name', 'revenue', 'ebitda'],
      })

      const result = await service.bootstrap(context)

      expect(result.ui.suggestedFlow).toBe('conversational')
    })

    it('should handle KBO prefill', async () => {
      const context: BootstrapContext = {
        prefilledQuery: 'Test Company BV',
        locale: 'en',
      }

      mockAuthResolver.resolve.mockResolvedValue({
        type: 'authenticated',
        userId: 'user-kbo-lookup',
      })

      mockSessionResolver.resolve.mockResolvedValue({
        mode: 'new',
        reportId: 'val_new_123',
        hasExistingData: false,
        status: 'draft',
      })

      mockPrefillResolver.resolve.mockResolvedValue({
        sources: ['kbo'],
        companyInfo: {
          companyName: 'Test Company BV',
          kboNumber: '0123456789',
          vatNumber: 'BE0123456789',
          city: 'Brussels',
        },
        kboData: {
          kboNumber: '0123456789',
          companyName: 'Test Company BV',
          isActive: true,
        },
        confidence: 0.6,
        fieldsPopulated: ['company_name', 'kbo_number', 'vat_number', 'city'],
        fieldsRemaining: ['revenue', 'ebitda'],
      })

      const result = await service.bootstrap(context)

      expect(result.prefillData.sources).toContain('kbo')
      expect(result.prefillData.kboData?.kboNumber).toBe('0123456789')
      expect(result.ui.showKboVerification).toBe(true)
    })

    it('should deduplicate parallel bootstrap requests', async () => {
      const context: BootstrapContext = {
        reportId: 'val_dedup_123',
        locale: 'en',
      }

      mockAuthResolver.resolve.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ type: 'authenticated', userId: 'user-dedup' }), 100)
          )
      )

      mockSessionResolver.resolve.mockResolvedValue({
        mode: 'new',
        reportId: context.reportId,
        hasExistingData: false,
        status: 'draft',
      })

      mockPrefillResolver.resolve.mockResolvedValue({
        sources: [],
        confidence: 0,
        fieldsPopulated: [],
        fieldsRemaining: [],
      })

      // Fire multiple parallel requests
      const [result1, result2, result3] = await Promise.all([
        service.bootstrap(context),
        service.bootstrap(context),
        service.bootstrap(context),
      ])

      // All should return the same result
      expect(result1.report.reportId).toBe(result2.report.reportId)
      expect(result2.report.reportId).toBe(result3.report.reportId)

      // Auth resolver should only be called once (deduplication)
      expect(mockAuthResolver.resolve).toHaveBeenCalledTimes(1)
    })

    it('should track bootstrap duration', async () => {
      const context: BootstrapContext = {
        locale: 'en',
      }

      mockAuthResolver.resolve.mockResolvedValue({ type: 'authenticated', userId: 'user-timing' })
      mockSessionResolver.resolve.mockResolvedValue({
        mode: 'new',
        reportId: 'val_timing_123',
        hasExistingData: false,
        status: 'draft',
      })
      mockPrefillResolver.resolve.mockResolvedValue({
        sources: [],
        confidence: 0,
        fieldsPopulated: [],
        fieldsRemaining: [],
      })

      const result = await service.bootstrap(context)

      expect(result.bootstrapDurationMs).toBeGreaterThanOrEqual(0)
      expect(result.bootstrappedAt).toBeInstanceOf(Date)
    })

    it('should gracefully handle resolver failures', async () => {
      const context: BootstrapContext = {
        locale: 'en',
      }

      mockAuthResolver.resolve.mockRejectedValue(new Error('Auth failed'))
      mockSessionResolver.resolve.mockResolvedValue({
        mode: 'new',
        reportId: 'val_fallback_123',
        hasExistingData: false,
        status: 'draft',
      })
      mockPrefillResolver.resolve.mockResolvedValue({
        sources: [],
        confidence: 0,
        fieldsPopulated: [],
        fieldsRemaining: [],
      })

      // Should not throw, but return fallback state
      const result = await service.bootstrap(context)

      // Fallback state should still be valid
      expect(result.identity).toBeDefined()
      expect(result.report).toBeDefined()
      expect(result.prefillData).toBeDefined()
    })
  })
})
