import { useCallback, useEffect, useState } from 'react'
import { backendAPI } from '../services/backendApi'
import { convertToApplicationError } from '../utils/errors/errorConverter'
import { generalLogger } from '../utils/logger'

// Note: Owner Dependency UI has been removed. This hook is kept for backward compatibility
// and future backend integration, but the assessment is now handled conversationally.
type OwnerDependencyFactors = Record<string, unknown>

interface ProfileData {
  owner_dependency_assessment?: OwnerDependencyFactors
  // Add other profile fields as needed
  company_name?: string
  industry?: string
  country?: string
}

interface UseProfileDataReturn {
  profileData: ProfileData | null
  loading: boolean
  error: Error | null
  hasOwnerDependency: boolean
  refetch: () => Promise<void>
}

/**
 * Hook to fetch user profile data including Owner Dependency assessment
 * from the main upswitch app if the user has already completed it.
 *
 * This enables intelligent triage by skipping questions that have already been answered.
 */
export const useProfileData = (): UseProfileDataReturn => {
  const [profileData, setProfileData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Call backend API to get user profile
      try {
        const profileData = await backendAPI.getProfile()
        // Map backend profile data to our interface
        const mappedData: ProfileData = {
          owner_dependency_assessment: profileData.owner_dependency_assessment,
          company_name: profileData.company_name,
          industry: profileData.industry,
          country: profileData.country,
        }
        setProfileData(mappedData)
        generalLogger.debug('[useProfileData] Profile data loaded', {
          hasCompanyName: !!mappedData.company_name,
          hasIndustry: !!mappedData.industry,
        })
      } catch (error) {
        const appError = convertToApplicationError(error)

        // If profile doesn't exist (404), that's OK - user hasn't created profile yet
        if (appError.code === 'NOT_FOUND') {
          generalLogger.debug(
            '[useProfileData] Profile not found - user may not have created profile yet',
            {
              code: appError.code,
            }
          )
          setProfileData(null)
        } else {
          throw appError
        }
      }
    } catch (error) {
      const appError = convertToApplicationError(error)

      // Log with specific error type
      if (appError.code === 'NETWORK_ERROR') {
        generalLogger.error('[useProfileData] Error fetching profile - network error', {
          error: appError.message,
          code: appError.code,
          context: appError.context,
        })
      } else if (appError.code === 'NOT_FOUND') {
        generalLogger.debug('[useProfileData] Profile not found', {
          error: appError.message,
          code: appError.code,
        })
      } else {
        generalLogger.error('[useProfileData] Error fetching profile', {
          error: appError.message,
          code: appError.code,
          context: appError.context,
        })
      }

      setError(appError)
      setProfileData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  return {
    profileData,
    loading,
    error,
    hasOwnerDependency: !!profileData?.owner_dependency_assessment,
    refetch: fetchProfile,
  }
}
