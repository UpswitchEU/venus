'use client'

import { motion } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import {
  buildBuyerProfileGapPrompt,
  buildListingGapPrompt,
  buyerProfileSubject,
  listingSubject,
} from './ChatAssistantAdvisoryPreviewActions'
import { ChatAssistantBelgianBootstrapCards } from './ChatAssistantBelgianBootstrapCards'
import {
  ChatAssistantClientDataReadinessCards,
  ChatAssistantMethodReadinessCards,
} from './ChatAssistantReadinessPreviewCards'
import type { ChatMessage } from './ChatAssistantTypes'

interface ChatAssistantAdvisoryPreviewCardsProps {
  message: ChatMessage
  onSendFollowUp?: (content: string) => void
}

export function ChatAssistantAdvisoryPreviewCards({
  message,
  onSendFollowUp,
}: ChatAssistantAdvisoryPreviewCardsProps) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const currencyLocale = locale === 'fr' ? 'fr-BE' : locale === 'en' ? 'en-BE' : 'nl-BE'

  return (
    <>
      {message.belgianCompanyBootstraps && message.belgianCompanyBootstraps.length > 0 && (
        <ChatAssistantBelgianBootstrapCards
          bootstraps={message.belgianCompanyBootstraps}
          currencyLocale={currencyLocale}
          onSendFollowUp={onSendFollowUp}
        />
      )}

      {message.clientDataReadinessPreviews && message.clientDataReadinessPreviews.length > 0 && (
        <ChatAssistantClientDataReadinessCards
          previews={message.clientDataReadinessPreviews}
          onSendFollowUp={onSendFollowUp}
        />
      )}

      {message.methodReadinessPreviews && message.methodReadinessPreviews.length > 0 && (
        <ChatAssistantMethodReadinessCards
          previews={message.methodReadinessPreviews}
          onSendFollowUp={onSendFollowUp}
        />
      )}

      {/* Listing previews — read-only anonymized marketplace draft. */}
      {message.listingPreviews && message.listingPreviews.length > 0 && (
        <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
          {message.listingPreviews.map((listingPreview) => {
            const isBlocked = listingPreview.status === 'blocked'
            const preview = listingPreview.preview
            const summaryBits: string[] = []
            if (preview?.title) summaryBits.push(preview.title)
            else if (listingPreview.sourceBusinessName)
              summaryBits.push(listingPreview.sourceBusinessName)
            if (preview?.sector) summaryBits.push(preview.sector)
            else if (preview?.industry) summaryBits.push(preview.industry)
            if (preview?.region) summaryBits.push(preview.region)
            else if (preview?.province) summaryBits.push(preview.province)
            if (preview?.revenueRange) summaryBits.push(preview.revenueRange)
            if (preview?.employeeRange) summaryBits.push(preview.employeeRange)
            if (!isBlocked && listingPreview.missingFields?.length) {
              summaryBits.push(
                ca('proposalCards.listingPreview.missingPrefix', {
                  fields: listingPreview.missingFields.join(', '),
                })
              )
            }
            const canContinue = typeof onSendFollowUp === 'function'
            const subject = listingSubject(listingPreview)

            return (
              <motion.div
                key={listingPreview.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="text-sm leading-relaxed"
              >
                <p className="text-foreground">
                  {isBlocked
                    ? ca('proposalCards.listingPreview.titleBlocked')
                    : ca('proposalCards.listingPreview.titleReady')}
                </p>
                {listingPreview.message && (
                  <p className="text-foreground/55 text-xs mt-0.5">{listingPreview.message}</p>
                )}
                {summaryBits.length > 0 && (
                  <p className="text-foreground/55 text-xs mt-0.5">{summaryBits.join(' · ')}</p>
                )}
                {!isBlocked && preview && (
                  <div className="mt-2 rounded-md bg-foreground/[0.035] px-2 py-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground/80 truncate">
                        {preview.title ??
                          listingPreview.sourceBusinessName ??
                          ca('proposalCards.listingPreview.untitled')}
                      </span>
                      <div className="shrink-0 flex items-center gap-1">
                        {preview.hasVerifiedValuation && (
                          <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] text-success/90">
                            {ca('proposalCards.listingPreview.verified')}
                          </span>
                        )}
                        {preview.ndaRequired && (
                          <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/55">
                            {ca('proposalCards.listingPreview.nda')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-foreground/55">
                      {preview.businessType && <span>{preview.businessType}</span>}
                      {preview.sector && <span>{preview.sector}</span>}
                      {preview.region && <span>{preview.region}</span>}
                      {preview.revenueRange && <span>{preview.revenueRange}</span>}
                      {preview.employeeRange && <span>{preview.employeeRange}</span>}
                    </div>
                  </div>
                )}
                {canContinue && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                    {isBlocked ? (
                      <button
                        type="button"
                        onClick={() => onSendFollowUp(buildListingGapPrompt(listingPreview))}
                        className="inline-flex min-h-11 items-center rounded-full px-3 text-primary/85 hover:text-primary transition-colors font-medium sm:min-h-0 sm:px-0"
                      >
                        {ca('proposalCards.listingPreview.resolveGapsAction')}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onSendFollowUp(`Profile likely buyers for ${subject}.`)}
                          className="inline-flex min-h-11 items-center rounded-full px-3 text-primary/85 hover:text-primary transition-colors font-medium sm:min-h-0 sm:px-0"
                        >
                          {ca('proposalCards.listingPreview.profileBuyersAction')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onSendFollowUp(
                              `Prepare a private marketplace listing draft for ${subject}.`
                            )
                          }
                          className="inline-flex min-h-11 items-center rounded-full px-3 text-foreground/55 hover:text-foreground/75 transition-colors sm:min-h-0 sm:px-0"
                        >
                          {ca('proposalCards.listingPreview.createDraftAction')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Buyer-profile previews — read-only bridge before listing approval. */}
      {message.buyerProfilePreviews && message.buyerProfilePreviews.length > 0 && (
        <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
          {message.buyerProfilePreviews.map((preview) => {
            const isBlocked = preview.status === 'blocked'
            const missing = preview.listingReadiness?.missingFields ?? []
            const summaryBits: string[] = []
            if (preview.sourceBusinessName) summaryBits.push(preview.sourceBusinessName)
            if (!isBlocked && preview.buyerSegments?.length) {
              summaryBits.push(
                ca('proposalCards.buyerProfile.segmentCount', {
                  count: preview.buyerSegments.length,
                })
              )
            }
            if (!isBlocked) {
              summaryBits.push(
                missing.length > 0
                  ? ca('proposalCards.buyerProfile.missingPrefix', {
                      fields: missing.join(', '),
                    })
                  : ca('proposalCards.buyerProfile.ready')
              )
            }
            const canContinue = typeof onSendFollowUp === 'function'
            const hasListingGaps = isBlocked || missing.length > 0
            const subject = buyerProfileSubject(preview)

            return (
              <motion.div
                key={preview.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="text-sm leading-relaxed"
              >
                <p className="text-foreground">
                  {isBlocked
                    ? ca('proposalCards.buyerProfile.titleBlocked')
                    : ca('proposalCards.buyerProfile.titleReady')}
                </p>
                {preview.message && (
                  <p className="text-foreground/55 text-xs mt-0.5">{preview.message}</p>
                )}
                {summaryBits.length > 0 && (
                  <p className="text-foreground/55 text-xs mt-0.5">{summaryBits.join(' · ')}</p>
                )}
                {!isBlocked && preview.buyerSegments && preview.buyerSegments.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {preview.buyerSegments.slice(0, 3).map((segment) => (
                      <div
                        key={segment.id ?? segment.label}
                        className="rounded-md bg-foreground/[0.035] px-2 py-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground/80 truncate">
                            {segment.label}
                          </span>
                          {segment.fitScore != null && (
                            <span className="shrink-0 font-mono text-foreground/45">
                              {segment.fitScore}/100
                            </span>
                          )}
                        </div>
                        {segment.recommendedAngle && (
                          <p className="mt-0.5 text-foreground/55">{segment.recommendedAngle}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {canContinue && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        onSendFollowUp(
                          hasListingGaps
                            ? buildBuyerProfileGapPrompt(preview)
                            : `Prepare a private marketplace listing draft for ${subject}.`
                        )
                      }
                      className="inline-flex min-h-11 items-center rounded-full px-3 text-primary/85 hover:text-primary transition-colors font-medium sm:min-h-0 sm:px-0"
                    >
                      {hasListingGaps
                        ? ca('proposalCards.buyerProfile.resolveGapsAction')
                        : ca('proposalCards.buyerProfile.createListingAction')}
                    </button>
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Business-type picker — sector/NACE/catalogue shortlist. Click a row to
            send a follow-up so the agent can use the selected type for
            benchmarks, method readiness, profile completion, or valuation. */}
      {message.businessTypeSearchResults && message.businessTypeSearchResults.length > 0 && (
        <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
          {message.businessTypeSearchResults.map((picker) => {
            const hasResults = picker.results.length > 0
            const isFailed = picker.status === 'failed'
            const countLabel = !hasResults
              ? picker.query.length > 0
                ? `No business types found for "${picker.query}"`
                : 'No business types found'
              : picker.totalFound === 1
                ? `Found ${picker.totalFound} business type for "${picker.query}"`
                : `Found ${picker.totalFound} business types for "${picker.query}"`
            return (
              <motion.div
                key={picker.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="text-sm leading-relaxed"
              >
                <p className="text-foreground font-medium">Business type catalogue</p>
                <p className="text-foreground/55 text-xs mt-0.5">{countLabel}</p>
                {isFailed && (
                  <p className="text-amber-700 dark:text-amber-300/90 text-xs mt-1">
                    {picker.error ?? 'The business-type catalogue is temporarily unavailable.'}
                  </p>
                )}
                {!isFailed && picker.note && (
                  <p className="text-foreground/55 text-xs italic mt-1">{picker.note}</p>
                )}
                {hasResults && (
                  <div className="mt-2 space-y-1">
                    {picker.results.slice(0, 10).map((result) => {
                      const taxonomy = [result.sector, result.industry, result.category]
                        .filter(Boolean)
                        .join(' · ')
                      const methods = (result.preferredMultiples ?? []).slice(0, 3).join(', ')
                      const benchmarkHint =
                        result.benchmarkStatus === 'resolver_required'
                          ? 'Multiples require benchmark resolver'
                          : result.benchmarkMessage
                      return (
                        <button
                          key={result.id}
                          type="button"
                          onClick={() => {
                            if (typeof onSendFollowUp !== 'function') return
                            onSendFollowUp(`Use business type ${result.title} (${result.id})`)
                          }}
                          disabled={typeof onSendFollowUp !== 'function'}
                          className="min-h-11 w-full text-left rounded-md bg-foreground/[0.035] px-3 py-2 text-xs hover:bg-foreground/[0.06] active:bg-foreground/[0.08] focus:outline-none focus:bg-foreground/[0.06] transition-colors disabled:cursor-default disabled:opacity-70 disabled:hover:bg-foreground/[0.035] sm:min-h-0 sm:px-2 sm:py-1.5"
                          aria-label={`Use business type ${result.title}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground/85 truncate">
                              {result.title}
                            </span>
                            <span className="shrink-0 font-mono text-foreground/55">
                              {result.id}
                            </span>
                          </div>
                          {taxonomy && (
                            <p className="mt-0.5 text-foreground/55 truncate">{taxonomy}</p>
                          )}
                          {result.description && (
                            <p className="mt-1 text-foreground/60 line-clamp-2">
                              {result.description}
                            </p>
                          )}
                          {(methods || benchmarkHint) && (
                            <p className="mt-1 text-foreground/45 truncate">
                              {[methods, benchmarkHint].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Registry-search picker — KBO/KVK hit list. Click a row to fire a
            follow-up "Use {name} ({registry} {number})" message so the agent
            can chain to bootstrap_belgian_company or create_client without
            the user re-typing the company. Mirrors Mercury's
            RegistrySearchResultsCard. */}
      {message.registrySearchResults && message.registrySearchResults.length > 0 && (
        <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-3">
          {message.registrySearchResults.map((picker) => {
            const isFailed =
              picker.status === 'failed' || picker.coverageWarning === 'upstream_degraded'
            const isMissing = picker.coverageWarning === 'kvk_not_in_dataset'
            const hasHits = picker.hits.length > 0
            const heading =
              picker.registry === 'KVK' ? 'Dutch KVK registry' : 'Belgian KBO registry'
            const countLabel = !hasHits
              ? picker.query.length > 0
                ? `No matches found for "${picker.query}"`
                : 'No matches found'
              : picker.totalFound === 1
                ? `Found ${picker.totalFound} match for "${picker.query}"`
                : `Found ${picker.totalFound} matches for "${picker.query}"`
            const formatNumber = (num: string) => {
              if (picker.registry === 'KBO' && /^\d{10}$/.test(num)) {
                return `${num.slice(0, 4)}.${num.slice(4, 7)}.${num.slice(7, 10)}`
              }
              return num
            }
            return (
              <motion.div
                key={picker.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="text-sm leading-relaxed"
              >
                <p className="text-foreground font-medium">{heading}</p>
                <p className="text-foreground/55 text-xs mt-0.5">{countLabel}</p>
                {isFailed && (
                  <p className="text-amber-700 dark:text-amber-300/90 text-xs mt-1">
                    The registry was temporarily unavailable. Try the company number directly, or
                    retry in a moment.
                  </p>
                )}
                {isMissing && (
                  <p className="text-amber-700 dark:text-amber-300/90 text-xs mt-1">
                    Not in Overheid.io&apos;s public-data mirror. Verify the KVK number — about 4%
                    of Handelsregister entries fall in this gap.
                  </p>
                )}
                {hasHits && (
                  <div className="mt-2 space-y-1">
                    {picker.hits.slice(0, 10).map((hit) => {
                      const sector = hit.businessTypeTitle ?? hit.naceDescription ?? null
                      const location = hit.city
                        ? hit.postalCode
                          ? `${hit.postalCode} ${hit.city}`
                          : hit.city
                        : null
                      const display = formatNumber(hit.companyNumber)
                      return (
                        <button
                          key={`${picker.registry}-${hit.companyNumber}`}
                          type="button"
                          onClick={() => {
                            if (typeof onSendFollowUp !== 'function') return
                            const ref = `${picker.registry} ${hit.companyNumber}`
                            onSendFollowUp(`Use ${hit.companyName} (${ref})`)
                          }}
                          disabled={typeof onSendFollowUp !== 'function'}
                          className="min-h-11 w-full text-left rounded-md bg-foreground/[0.035] px-3 py-2 text-xs hover:bg-foreground/[0.06] active:bg-foreground/[0.08] focus:outline-none focus:bg-foreground/[0.06] transition-colors disabled:cursor-default disabled:opacity-70 disabled:hover:bg-foreground/[0.035] sm:min-h-0 sm:px-2 sm:py-1.5"
                          aria-label={`Use ${hit.companyName}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground/85 truncate">
                              {hit.companyName}
                              {hit.legalForm && (
                                <span className="text-foreground/55 font-normal">
                                  {' '}
                                  · {hit.legalForm}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 font-mono text-foreground/55">{display}</span>
                          </div>
                          {(location || sector) && (
                            <p className="mt-0.5 text-foreground/55 truncate">
                              {[location, sector].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </>
  )
}
