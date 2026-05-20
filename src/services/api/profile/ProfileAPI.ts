/**
 * Profile API Service
 *
 * Single Responsibility: Handle profile operations
 * Extracted to follow SRP
 *
 * @module services/api/profile/ProfileAPI
 */

import { APIError, AuthenticationError } from '../../../types/errors'
import { apiLogger } from '../../../utils/logger'
import { APIRequestConfig, HttpClient } from '../HttpClient'

export interface ProfileData {
  owner_dependency_assessment?: Record<string, unknown>
  company_name?: string
  industry?: string
  country?: string
  [key: string]: unknown
}

function getHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || Array.isArray(error)) return undefined
  const response = (error as { response?: unknown }).response
  if (!response || typeof response !== 'object' || Array.isArray(response)) return undefined
  const status = (response as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

export class ProfileAPI extends HttpClient {
  /**
   * Get current user's profile
   */
  async getProfile(options?: APIRequestConfig): Promise<ProfileData> {
    try {
      const response = await this.executeRequest<{
        success: boolean
        data: ProfileData
      }>(
        {
          method: 'GET',
          url: '/api/v2/users/profile/me',
          headers: {},
        },
        options
      )
      return response.data
    } catch (error) {
      this.handleProfileError(error, 'get profile')
    }
  }

  /**
   * Update current user's profile
   */
  async updateProfile(
    data: Partial<ProfileData>,
    options?: APIRequestConfig
  ): Promise<ProfileData> {
    try {
      const response = await this.executeRequest<{
        success: boolean
        data: ProfileData
      }>(
        {
          method: 'PUT',
          url: '/api/v2/users/profile/me',
          data,
          headers: {},
        },
        options
      )
      return response.data
    } catch (error) {
      this.handleProfileError(error, 'update profile')
    }
  }

  /**
   * Handle profile-specific errors
   */
  private handleProfileError(error: unknown, operation: string): never {
    apiLogger.error(`Profile ${operation} failed`, { error })

    const status = getHttpStatus(error)

    if (status === 401 || status === 403) {
      throw new AuthenticationError('Authentication required for profile operations')
    }

    if (status === 404) {
      // Profile doesn't exist yet - return empty profile
      throw new APIError('Profile not found', status, undefined, true)
    }

    throw new APIError(`Failed to ${operation}`, status, undefined, true, {
      originalError: error,
    })
  }
}
