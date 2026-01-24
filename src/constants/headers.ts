/**
 * Client Context Headers
 *
 * Centralized header constants for accountant-client flow.
 * These headers are used to pass client context information
 * when an accountant is acting on behalf of a client.
 *
 * CANONICAL FORMAT (use these):
 * - X-Client-User-Id
 * - X-Accountant-User-Id
 * - X-Relationship-Id
 *
 * LEGACY FORMAT (accept but don't send):
 * - X-Client-Context-User
 * - X-Client-Context-Accountant
 * - X-Client-Context-Relationship
 *
 * @module constants/headers
 */

/**
 * Canonical header names for client context
 */
export const CLIENT_CONTEXT_HEADERS = {
  /** ID of the client user being acted upon */
  CLIENT_USER_ID: 'X-Client-User-Id',
  /** ID of the accountant performing the action */
  ACCOUNTANT_USER_ID: 'X-Accountant-User-Id',
  /** ID of the accountant-client relationship */
  RELATIONSHIP_ID: 'X-Relationship-Id',
} as const;

/**
 * Legacy header names (for backward compatibility only)
 * @deprecated Use CLIENT_CONTEXT_HEADERS instead
 */
export const LEGACY_CLIENT_CONTEXT_HEADERS = {
  CLIENT_USER_ID: 'X-Client-Context-User',
  ACCOUNTANT_USER_ID: 'X-Client-Context-Accountant',
  RELATIONSHIP_ID: 'X-Client-Context-Relationship',
} as const;

/**
 * Extract client context from request headers
 * Accepts both canonical and legacy header formats for backward compatibility
 *
 * @param getHeader - Function to get header value by name
 * @returns Client context or null if not present
 */
export function extractClientContextFromHeaders(
  getHeader: (name: string) => string | null,
): { clientUserId: string; accountantUserId: string; relationshipId: string } | null {
  // Try canonical headers first, then legacy
  const clientUserId = 
    getHeader(CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID.toLowerCase()) || 
    getHeader(LEGACY_CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID.toLowerCase());
  
  const accountantUserId = 
    getHeader(CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID.toLowerCase()) || 
    getHeader(LEGACY_CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID.toLowerCase());
  
  const relationshipId = 
    getHeader(CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID.toLowerCase()) || 
    getHeader(LEGACY_CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID.toLowerCase());

  // Return null if any required header is missing
  if (!clientUserId || !accountantUserId) {
    return null;
  }

  return {
    clientUserId,
    accountantUserId,
    relationshipId: relationshipId || '',
  };
}

/**
 * Build client context headers for outgoing requests
 * Always uses the canonical format
 *
 * @param context - Client context data
 * @returns Headers object
 */
export function buildClientContextHeaders(
  context: { clientUserId: string; accountantUserId: string; relationshipId?: string },
): Record<string, string> {
  const headers: Record<string, string> = {
    [CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID]: context.clientUserId,
    [CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID]: context.accountantUserId,
  };

  if (context.relationshipId) {
    headers[CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID] = context.relationshipId;
  }

  return headers;
}
