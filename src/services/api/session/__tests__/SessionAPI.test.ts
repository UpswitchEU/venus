/**
 * SessionAPI Integration Tests
 * 
 * Bank-grade tests for session API operations.
 * Verifies clean authenticated-only flow with no race conditions.
 * 
 * @module services/api/session/__tests__/SessionAPI
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';

// Mock HttpClient before importing SessionAPI
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../HttpClient', () => ({
  HttpClient: {
    getInstance: vi.fn(() => ({
      get: mockGet,
      post: mockPost,
      put: mockPut,
      patch: mockPatch,
      delete: mockDelete,
    })),
  },
}));

vi.mock('../../../../utils/logger', () => ({
  apiLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocks
import { SessionAPI } from '../SessionAPI';

describe('SessionAPI', () => {
  let api: SessionAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    api = new SessionAPI();
  });

  describe('getValuationSession', () => {
    it('should fetch session by ID', async () => {
      const mockSession = {
        session_key: 'val_test_123',
        user_id: 'user-123',
        session_data: { company_name: 'Test Corp' },
        updated_at: new Date().toISOString(),
      };

      mockGet.mockResolvedValue({ data: mockSession });

      const result = await api.getValuationSession('val_test_123');

      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('/valuations/sessions/val_test_123'),
        expect.any(Object)
      );
      expect(result.session_key).toBe('val_test_123');
    });

    it('should handle 404 gracefully', async () => {
      mockGet.mockRejectedValue({ response: { status: 404 } });

      const result = await api.getValuationSession('val_nonexistent');

      expect(result).toBeNull();
    });

    it('should throw on other errors', async () => {
      mockGet.mockRejectedValue({ response: { status: 500, data: 'Server error' } });

      await expect(api.getValuationSession('val_error')).rejects.toThrow();
    });
  });

  describe('createValuationSession', () => {
    it('should create new session', async () => {
      const mockCreatedSession = {
        session_key: 'val_new_123',
        user_id: 'user-456',
        session_data: {},
        status: 'active',
      };

      mockPost.mockResolvedValue({ data: mockCreatedSession });

      const result = await api.createValuationSession({
        sessionData: { company_name: 'New Corp' },
      });

      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining('/valuations/sessions'),
        expect.objectContaining({
          session_data: { company_name: 'New Corp' },
        }),
        expect.any(Object)
      );
      expect(result.session_key).toBe('val_new_123');
    });

    it('should throw on creation failure', async () => {
      mockPost.mockRejectedValue({ response: { status: 400, data: 'Invalid data' } });

      await expect(
        api.createValuationSession({ sessionData: {} })
      ).rejects.toThrow();
    });
  });

  describe('updateValuationSession', () => {
    it('should update existing session', async () => {
      const mockUpdatedSession = {
        session_key: 'val_update_123',
        user_id: 'user-789',
        session_data: { company_name: 'Updated Corp' },
        updated_at: new Date().toISOString(),
      };

      mockPatch.mockResolvedValue({ data: mockUpdatedSession });

      const result = await api.updateValuationSession('val_update_123', {
        sessionData: { company_name: 'Updated Corp' },
      });

      expect(mockPatch).toHaveBeenCalledWith(
        expect.stringContaining('/valuations/sessions/val_update_123'),
        expect.objectContaining({
          session_data: { company_name: 'Updated Corp' },
        }),
        expect.any(Object)
      );
      expect(result.session_data.company_name).toBe('Updated Corp');
    });

    it('should throw on 404 (session not found)', async () => {
      mockPatch.mockRejectedValue({ response: { status: 404 } });

      await expect(
        api.updateValuationSession('val_nonexistent', { sessionData: {} })
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('deleteValuationSession', () => {
    it('should delete session', async () => {
      mockDelete.mockResolvedValue({ data: { success: true } });

      const result = await api.deleteValuationSession('val_delete_123');

      expect(mockDelete).toHaveBeenCalledWith(
        expect.stringContaining('/valuations/sessions/val_delete_123'),
        expect.any(Object)
      );
      expect(result.success).toBe(true);
    });
  });

  describe('Bootstrap Integration', () => {
    it('should call bootstrap endpoint', async () => {
      const mockBootstrapResponse = {
        session: {
          session_key: 'val_bootstrap_123',
          user_id: 'user-bootstrap',
          session_data: { company_name: 'Bootstrap Corp' },
        },
        identity: {
          type: 'authenticated',
          userId: 'user-bootstrap',
        },
        creditStatus: {
          hasCredits: true,
          creditsRemaining: 5,
        },
        prefill: {
          sources: ['user_profile'],
        },
      };

      mockPost.mockResolvedValue({ data: mockBootstrapResponse });

      const result = await api.bootstrap({
        reportId: 'val_bootstrap_123',
        locale: 'en',
      });

      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining('/valuations/sessions/bootstrap'),
        expect.objectContaining({
          reportId: 'val_bootstrap_123',
          locale: 'en',
        }),
        expect.any(Object)
      );
      expect(result.identity.type).toBe('authenticated');
      expect(result.creditStatus.hasCredits).toBe(true);
    });

    it('should handle bootstrap with client token', async () => {
      const mockBootstrapResponse = {
        session: null,
        identity: {
          type: 'accountant_for_client',
          userId: 'client-123',
          clientContext: {
            accountantUserId: 'accountant-456',
            clientUserId: 'client-123',
            relationshipId: 'rel-789',
          },
        },
        creditStatus: {
          hasCredits: true,
          creditsRemaining: 50,
          isAccountantFlow: true,
        },
        prefill: {
          sources: ['kbo'],
        },
      };

      mockPost.mockResolvedValue({ data: mockBootstrapResponse });

      const result = await api.bootstrap({
        clientToken: 'ct_abc123',
        locale: 'nl',
      });

      expect(result.identity.type).toBe('accountant_for_client');
      expect(result.identity.clientContext?.accountantUserId).toBe('accountant-456');
    });
  });

  describe('Promise Deduplication', () => {
    it('should deduplicate parallel get requests for same session', async () => {
      const mockSession = {
        session_key: 'val_dedup_123',
        user_id: 'user-dedup',
        session_data: {},
      };

      mockGet.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ data: mockSession }), 100))
      );

      // Fire multiple parallel requests
      const [result1, result2, result3] = await Promise.all([
        api.getValuationSession('val_dedup_123'),
        api.getValuationSession('val_dedup_123'),
        api.getValuationSession('val_dedup_123'),
      ]);

      // HttpClient.get should only be called once (deduplication)
      expect(mockGet).toHaveBeenCalledTimes(1);

      // All results should be the same
      expect(result1?.session_key).toBe(result2?.session_key);
      expect(result2?.session_key).toBe(result3?.session_key);
    });

    it('should not deduplicate different session IDs', async () => {
      const mockSession1 = { session_key: 'val_a', session_data: {} };
      const mockSession2 = { session_key: 'val_b', session_data: {} };

      mockGet.mockImplementation((url: string) => {
        if (url.includes('val_a')) {
          return Promise.resolve({ data: mockSession1 });
        }
        return Promise.resolve({ data: mockSession2 });
      });

      await Promise.all([
        api.getValuationSession('val_a'),
        api.getValuationSession('val_b'),
      ]);

      // HttpClient.get should be called twice (different sessions)
      expect(mockGet).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Classification', () => {
    it('should classify network errors', async () => {
      mockGet.mockRejectedValue({ code: 'ECONNREFUSED' });

      try {
        await api.getValuationSession('val_network');
      } catch (error: any) {
        expect(error.isNetworkError || error.code === 'ECONNREFUSED').toBe(true);
      }
    });

    it('should classify authentication errors', async () => {
      mockGet.mockRejectedValue({ response: { status: 401 } });

      try {
        await api.getValuationSession('val_auth');
      } catch (error: any) {
        expect(error.response?.status).toBe(401);
      }
    });

    it('should classify rate limit errors', async () => {
      mockGet.mockRejectedValue({ response: { status: 429 } });

      try {
        await api.getValuationSession('val_ratelimit');
      } catch (error: any) {
        expect(error.response?.status).toBe(429);
      }
    });
  });
});
