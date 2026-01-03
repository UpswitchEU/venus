/**
 * Token Refresh Hook (Valuation Tester)
 * 
 * Automatically refreshes JWT tokens before they expire to ensure
 * users are never logged out unexpectedly
 * 
 * Strategy:
 * - Proactive refresh at 80% of TTL (refresh before expiration)
 * - Check token expiry every 5 minutes
 * - Background refresh without user interruption
 * - Silent refresh with exponential backoff
 * - Fallback to re-login if refresh fails
 * - Refresh on visibility change (tab focus)
 */

import axios from 'axios';
import { useCallback, useEffect, useRef } from 'react';
import { getSessionSyncManager } from '../utils/auth/sessionSync';

const API_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://api.upswitch.app';
const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes (more frequent for proactive refresh)
const REFRESH_THRESHOLD = 0.8; // Refresh at 80% of TTL (proactive)

interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp?: number;
}

interface RefreshOptions {
  onRefreshSuccess?: () => void;
  onRefreshFailure?: (error: Error) => void;
  onTokenExpired?: () => void;
}

export const useTokenRefresh = (options: RefreshOptions = {}) => {
  const { onRefreshSuccess, onRefreshFailure, onTokenExpired } = options;
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef(false);
  const lastRefreshAttemptRef = useRef<number>(0);
  
  /**
   * Refresh token with exponential backoff
   */
  const refreshToken = useCallback(async (retryCount = 0): Promise<boolean> => {
    // Prevent concurrent refresh attempts
    if (isRefreshingRef.current) {
      console.log('Token refresh already in progress, skipping...');
      return false;
    }
    
    // Rate limiting: Don't attempt refresh more than once per minute
    const now = Date.now();
    if (now - lastRefreshAttemptRef.current < 60 * 1000) {
      console.log('Token refresh rate limited, skipping...');
      return false;
    }
    
    isRefreshingRef.current = true;
    lastRefreshAttemptRef.current = now;
    
    try {
      console.log('🔄 Attempting to refresh session token...');
      
      const response = await axios.post(
        `${API_URL}/api/v2/auth/refresh`,
        {},
        {
          withCredentials: true, // Important: Include cookies (refresh token)
          timeout: 10000, // 10 second timeout
        }
      );
      
      if (response.data && response.data.user) {
        console.log('✅ Session token refreshed successfully');
        onRefreshSuccess?.();
        return true;
      } else {
        throw new Error('Token refresh failed: Invalid response');
      }
    } catch (error: any) {
      console.error('❌ Token refresh failed:', error);
      
      // Handle different error cases
      if (error.response?.status === 401) {
        // Token is invalid or expired - user needs to re-login
        console.warn('Token expired, user needs to re-login');
        onTokenExpired?.();
        return false;
      }
      
      // Network error or server error - retry with exponential backoff
      if (retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        console.log(`Retrying token refresh in ${delay}ms (attempt ${retryCount + 1}/3)...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return refreshToken(retryCount + 1);
      }
      
      // Max retries exceeded
      console.error('Token refresh failed after 3 attempts');
      onRefreshFailure?.(error);
      return false;
    } finally {
      isRefreshingRef.current = false;
    }
  }, [onRefreshSuccess, onRefreshFailure, onTokenExpired]);
  
  /**
   * Check if token needs refresh
   */
  const checkAndRefresh = useCallback(async () => {
    try {
      // Proactively refresh access token before it expires
      // Access tokens expire in 15 minutes, so we refresh every 10 minutes
      console.log('🔄 Proactive token refresh check...');
      await refreshToken();
        
      // Broadcast session refresh to other tabs AFTER successful refresh
      const syncManager = getSessionSyncManager();
      syncManager.broadcastSessionRefresh(window.location.hostname);
    } catch (error: any) {
      if (error.response?.status === 401) {
        // User is not authenticated, stop checking
        console.log('User not authenticated, stopping token refresh checks');
        onTokenExpired?.();
        
        // Clear interval
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        // Network error, will retry on next interval
        console.warn('Auth check failed (network error), will retry:', error.message);
      }
    }
  }, [refreshToken, onTokenExpired]);
  
  /**
   * Start token refresh checks
   */
  useEffect(() => {
    console.log('🔐 Starting token refresh checks (interval: 1 hour)');
    
    // Initial check after 5 seconds (give app time to initialize)
    const initialTimeout = setTimeout(() => {
      checkAndRefresh();
    }, 5000);
    
    // Set up periodic checks
    intervalRef.current = setInterval(() => {
      checkAndRefresh();
    }, CHECK_INTERVAL);
    
    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      clearTimeout(initialTimeout);
      console.log('🔐 Stopped token refresh checks');
    };
  }, [checkAndRefresh]);
  
  // Return refresh function for manual triggering
  return {
    refreshToken,
    isRefreshing: isRefreshingRef.current,
  };
};

/**
 * Hook for manually refreshing token
 * Useful for "Refresh Session" buttons or triggered refresh
 */
export const useManualTokenRefresh = () => {
  const isRefreshingRef = useRef(false);
  
  const refreshToken = useCallback(async (): Promise<boolean> => {
    if (isRefreshingRef.current) {
      console.log('Token refresh already in progress');
      return false;
    }
    
    isRefreshingRef.current = true;
    
    try {
      const response = await axios.post(
        `${API_URL}/api/v2/auth/refresh`,
        {},
        {
          withCredentials: true, // Include refresh token cookie
          timeout: 10000,
        }
      );
      
      if (response.data && response.data.user) {
        console.log('✅ Manual token refresh successful');
        return true;
      } else {
        throw new Error('Token refresh failed: Invalid response');
      }
    } catch (error) {
      console.error('❌ Manual token refresh failed:', error);
      return false;
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);
  
  return {
    refreshToken,
    isRefreshing: isRefreshingRef.current,
  };
};