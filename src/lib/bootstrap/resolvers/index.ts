/**
 * Bootstrap Resolvers
 *
 * Independent resolvers for each aspect of bootstrap state.
 * Each resolver can fail gracefully with fallback values.
 *
 * @module lib/bootstrap/resolvers
 */

export { AuthResolver, authResolver } from './AuthResolver'
export { PrefillResolver, prefillResolver } from './PrefillResolver'
export { SessionResolver, sessionResolver } from './SessionResolver'
