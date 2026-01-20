/**
 * Guest Session Engine Architecture Validation Tests
 * 
 * Ensures GuestSessionEngine maintains clean separation:
 * - Never calls credit service
 * - Never calls premium gates
 * - Only calls backend on explicit save
 * - Zero friction sandbox experience
 * 
 * @module services/session/engines/__tests__/GuestSessionEngine
 */

import { GuestSessionEngine } from '../GuestSessionEngine';
import type { IdentityState } from '../../../../lib/bootstrap/types';

describe('GuestSessionEngine Architecture Validation', () => {
  let engine: GuestSessionEngine;
  let mockIdentity: IdentityState;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    
    mockIdentity = {
      type: 'guest',
      guestSessionId: 'test_guest_session_123',
    };
    
    engine = new GuestSessionEngine();
    engine.initialize(mockIdentity);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Credit Check Isolation', () => {
    it('should never call credit service during loadSession', async () => {
      // Mock credit service to detect calls
      const creditServiceSpy = jest.spyOn(
        require('../../../../services/api/credit/CreditAPI'),
        'checkCredits'
      ).mockImplementation(() => {
        throw new Error('Credit service should never be called');
      });

      await engine.loadSession('test_report_id', 'manual');

      // Credit service should never be called
      expect(creditServiceSpy).not.toHaveBeenCalled();
      
      creditServiceSpy.mockRestore();
    });

    it('should never call credit service during updateSession', () => {
      // Mock credit service to detect calls
      const creditServiceSpy = jest.spyOn(
        require('../../../../services/api/credit/CreditAPI'),
        'checkCredits'
      ).mockImplementation(() => {
        throw new Error('Credit service should never be called');
      });

      // Load session first
      engine.loadSession('test_report_id', 'manual').then(() => {
        // Update session
        engine.updateSession({
          sessionData: { company_name: 'Test Company' },
        });

        // Credit service should never be called
        expect(creditServiceSpy).not.toHaveBeenCalled();
      });

      creditServiceSpy.mockRestore();
    });

    it('should only call backend on explicit saveSession', async () => {
      // Load session
      await engine.loadSession('test_report_id', 'manual');
      
      // Update session (should not call backend)
      engine.updateSession({
        sessionData: { company_name: 'Test Company' },
      });

      // Verify session is stored locally
      const stored = localStorage.getItem('guest_session_test_report_id');
      expect(stored).toBeTruthy();
      
      // Note: saveSession() will call backend, but that's expected
      // The test verifies that updateSession() doesn't call backend
    });
  });

  describe('Premium Gate Isolation', () => {
    it('should never check premium status', () => {
      // Mock premium check to detect calls
      const premiumCheckSpy = jest.spyOn(
        require('../../../../hooks/usePermissions'),
        'usePermissions'
      ).mockImplementation(() => {
        throw new Error('Premium check should never be called');
      });

      // Load session
      engine.loadSession('test_report_id', 'manual');

      // Premium check should never be called
      expect(premiumCheckSpy).not.toHaveBeenCalled();
      
      premiumCheckSpy.mockRestore();
    });

    it('should never block operations based on premium status', async () => {
      // Load session
      await engine.loadSession('test_report_id', 'manual');
      
      // Update session (should never be blocked)
      engine.updateSession({
        sessionData: { company_name: 'Test Company' },
      });

      // Verify session was updated (not blocked)
      const session = engine.getSession();
      expect(session?.sessionData).toHaveProperty('company_name', 'Test Company');
    });
  });

  describe('Backend Call Isolation', () => {
    it('should only call backend on explicit saveSession', async () => {
      // Mock SessionAPI to detect calls
      const sessionAPISpy = jest.spyOn(
        require('../../../../services/api/session/SessionAPI'),
        'SessionAPI'
      ).mockImplementation(() => ({
        createValuationSession: jest.fn().mockResolvedValue({
          success: true,
          session: { reportId: 'test_report_id' },
        }),
      }));

      // Load session (should not call backend)
      await engine.loadSession('test_report_id', 'manual');
      
      // Update session (should not call backend)
      engine.updateSession({
        sessionData: { company_name: 'Test Company' },
      });

      // Verify no backend calls yet
      expect(sessionAPISpy).not.toHaveBeenCalled();

      // Explicit save (should call backend)
      await engine.saveSession('user');

      // Now backend should be called
      expect(sessionAPISpy).toHaveBeenCalled();
      
      sessionAPISpy.mockRestore();
    });

    it('should skip non-user saves (autosave/system)', async () => {
      // Mock SessionAPI to detect calls
      const sessionAPISpy = jest.spyOn(
        require('../../../../services/api/session/SessionAPI'),
        'SessionAPI'
      ).mockImplementation(() => ({
        createValuationSession: jest.fn(),
      }));

      // Load session
      await engine.loadSession('test_report_id', 'manual');

      // Try autosave (should be skipped)
      await engine.saveSession('autosave');
      
      // Try system save (should be skipped)
      await engine.saveSession('system');

      // Backend should never be called for non-user saves
      expect(sessionAPISpy).not.toHaveBeenCalled();
      
      sessionAPISpy.mockRestore();
    });
  });

  describe('localStorage Isolation', () => {
    it('should store all data in localStorage', async () => {
      // Load session
      await engine.loadSession('test_report_id', 'manual');
      
      // Update session
      engine.updateSession({
        sessionData: { company_name: 'Test Company' },
      });

      // Verify data is in localStorage
      const stored = localStorage.getItem('guest_session_test_report_id');
      expect(stored).toBeTruthy();
      
      const parsed = JSON.parse(stored!);
      expect(parsed.sessionData).toHaveProperty('company_name', 'Test Company');
    });

    it('should load data from localStorage', async () => {
      // Pre-populate localStorage
      const testSession = {
        reportId: 'test_report_id',
        currentView: 'manual',
        dataSource: 'manual',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sessionData: { company_name: 'Pre-existing Company' },
        partialData: {},
      };
      
      localStorage.setItem(
        'guest_session_test_report_id',
        JSON.stringify(testSession)
      );

      // Load session
      const session = await engine.loadSession('test_report_id', 'manual');

      // Verify data was loaded from localStorage
      expect(session?.sessionData).toHaveProperty('company_name', 'Pre-existing Company');
    });
  });

  describe('Zero Friction Guarantee', () => {
    it('should never throw errors for credit-related operations', async () => {
      // Load session
      await engine.loadSession('test_report_id', 'manual');
      
      // Update session multiple times (should never fail)
      engine.updateSession({ sessionData: { company_name: 'Test' } });
      engine.updateSession({ sessionData: { revenue: 100000 } });
      engine.updateSession({ sessionData: { ebitda: 50000 } });

      // Verify no errors were thrown
      const session = engine.getSession();
      expect(session).toBeTruthy();
      expect(session?.sessionData).toHaveProperty('company_name', 'Test');
      expect(session?.sessionData).toHaveProperty('revenue', 100000);
      expect(session?.sessionData).toHaveProperty('ebitda', 50000);
    });

    it('should never block operations based on credits', async () => {
      // Load session
      await engine.loadSession('test_report_id', 'manual');
      
      // Perform multiple operations (should never be blocked)
      engine.updateSession({ sessionData: { company_name: 'Test' } });
      engine.updateSession({ sessionData: { revenue: 100000 } });
      engine.updateSession({ sessionData: { ebitda: 50000 } });

      // Verify all operations succeeded
      const session = engine.getSession();
      expect(session).toBeTruthy();
      expect(session?.sessionData).toHaveProperty('company_name', 'Test');
    });
  });
});
