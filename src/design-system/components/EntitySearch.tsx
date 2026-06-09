/**
 * Entity Search Components
 *
 * Stable public export surface for KBO company search and business-type search.
 * Implementations live in ./entity-search to keep each module reviewable.
 */

export {
  categoryEmojis,
  categoryIcons,
  categoryLabels,
  defaultBusinessTypes,
} from './entity-search/BusinessTypeData'
export type { BusinessTypeSearchInputProps } from './entity-search/BusinessTypeSearchInput'
export { BusinessTypeSearchInput } from './entity-search/BusinessTypeSearchInput'
export type { BusinessType, KBOCompany } from './entity-search/EntitySearchTypes'
export type { KBOSearchInputProps } from './entity-search/KBOSearchInput'
export { KBOSearchInput } from './entity-search/KBOSearchInput'
export type { KboConfirmedCardProps } from './entity-search/KboConfirmedCard'
export { KboConfirmedCard } from './entity-search/KboConfirmedCard'
