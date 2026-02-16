/**
 * Business Profile Card V4 - Airbnb Card Style
 * Variation 4: Simple square card with icon overlays and tooltips
 * Inspired by Airbnb listing cards - minimal, visual, interactive
 * Adapted for valuation-tester from upswitch-frontend
 */

'use client'

import { Edit } from 'lucide-react'
import { useTransitionRouter } from 'next-view-transitions'
import React, { useState } from 'react'
import { getBusinessTypeIcon, getBusinessTypeTitle } from '../../utils/businessTypeDisplay'
import type { BusinessInfo } from '../../utils/valuationSessionMapper'

interface BusinessProfileCardV4Props {
  businessInfo?: BusinessInfo
  reportId?: string
  onEdit?: () => void
  className?: string
  profileCardData?: {
    profileImage?: string
    fullName?: string
    location?: string
  } | null
  hasValuationReports?: boolean
  latestValuationReport?: {
    businessValue: number
    method?: string
    confidence?: string
    date?: Date | string
  } | null
  onCreateValuation?: () => void
}

const BusinessProfileCardV4: React.FC<BusinessProfileCardV4Props> = ({
  businessInfo,
  reportId,
  onEdit,
  className = '',
  profileCardData,
  hasValuationReports,
  latestValuationReport,
  onCreateValuation,
}) => {
  const router = useTransitionRouter()
  const [hoveredBadge, setHoveredBadge] = useState<string | null>(null)

  if (!businessInfo) return null

  // Handle card click - navigate to report
  const handleCardClick = () => {
    if (reportId) {
      router.push(`/reports/${reportId}`)
    } else if (onCreateValuation) {
      onCreateValuation()
    }
  }

  // Handle valuation badge click
  const handleValuationClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (reportId) {
      router.push(`/reports/${reportId}`)
    } else if (onCreateValuation) {
      onCreateValuation()
    }
  }

  // Format valuation amount
  const formatValuationAmount = (amount: number): string => {
    if (amount >= 1000000) {
      const millions = amount / 1000000
      return `€${millions.toFixed(millions >= 10 ? 0 : 1)}M`
    } else if (amount >= 1000) {
      const thousands = amount / 1000
      return `€${thousands.toFixed(thousands >= 10 ? 0 : 1)}K`
    } else {
      return `€${Math.round(amount)}`
    }
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Card Container - Responsive Square aspect ratio */}
      <div className="relative group cursor-pointer aspect-square" onClick={handleCardClick}>
        {/* Main Card - Square with gradient background - Mobile Optimized */}
        <div
          className="relative w-full h-full rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-300"
          style={{
            background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)',
          }}
        >
          {/* Edit Button - Bottom Right (on hover) - Mobile Optimized */}
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onEdit()
              }}
              className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 p-2 sm:p-2.5 bg-white/90 backdrop-blur-sm rounded-full opacity-0 group-hover:opacity-100 sm:group-hover:opacity-100 transition-opacity duration-200 z-20 hover:bg-white touch-manipulation"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <Edit className="w-4 h-4 sm:w-5 sm:h-5 text-foreground" />
            </button>
          )}

          {/* Badge Overlays - Top Left - Mobile Optimized */}
          <div className="absolute top-2 left-2 sm:top-3 sm:left-3 flex flex-col gap-1.5 sm:gap-2 z-10">
            {/* Valuation Badge */}
            {!hasValuationReports ? (
              <div className="relative">
                <button
                  onClick={handleValuationClick}
                  onMouseEnter={() => setHoveredBadge('valuation')}
                  onMouseLeave={() => setHoveredBadge(null)}
                  className="min-w-[44px] min-h-[44px] w-10 h-10 sm:w-12 sm:h-12 bg-amber-500 hover:bg-amber-600 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 touch-manipulation"
                >
                  <span className="text-xl">💰</span>
                </button>
                {hoveredBadge === 'valuation' && (
                  <div className="absolute left-12 top-0 bg-popover text-foreground text-xs px-3 py-2 rounded-lg whitespace-nowrap z-20">
                    Get valuation
                    <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 w-2 h-2 bg-popover rotate-45"></div>
                  </div>
                )}
              </div>
            ) : (
              latestValuationReport && (
                <div className="relative">
                  <button
                    onClick={handleValuationClick}
                    onMouseEnter={() => setHoveredBadge('valuation-complete')}
                    onMouseLeave={() => setHoveredBadge(null)}
                    className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-500 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
                  >
                    <span className="text-xl">💰</span>
                  </button>
                  {hoveredBadge === 'valuation-complete' && (
                    <div className="absolute left-12 top-0 bg-popover text-foreground text-xs px-3 py-2 rounded-lg whitespace-nowrap z-20">
                      {formatValuationAmount(latestValuationReport.businessValue)}
                      <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 w-2 h-2 bg-popover rotate-45"></div>
                    </div>
                  )}
                </div>
              )
            )}
          </div>

          {/* Profile/Owner - Top Right */}
          <div className="absolute top-3 right-3 z-10">
            {profileCardData?.profileImage ? (
              // Show avatar when profile image exists
              <div className="relative">
                <img
                  src={profileCardData.profileImage}
                  alt={profileCardData.fullName || 'Owner'}
                  onMouseEnter={() => setHoveredBadge('owner')}
                  onMouseLeave={() => setHoveredBadge(null)}
                  className="w-12 h-12 rounded-full border-2 border-white object-cover cursor-pointer"
                  onError={(e) => {
                    // Fallback to emoji if image fails
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    const parent = target.parentElement
                    if (parent && !parent.querySelector('.emoji-fallback')) {
                      const emoji = document.createElement('div')
                      emoji.className =
                        'emoji-fallback w-12 h-12 rounded-full border-2 border-white bg-white flex items-center justify-center text-xl'
                      emoji.textContent = '👤'
                      parent.appendChild(emoji)
                    }
                  }}
                />
                {hoveredBadge === 'owner' && (
                  <div className="absolute right-0 top-14 bg-popover text-foreground text-xs px-3 py-2 rounded-lg whitespace-nowrap z-20">
                    Owned by {profileCardData.fullName}
                    <div className="absolute right-3 top-0 -translate-y-1/2 w-2 h-2 bg-popover rotate-45"></div>
                  </div>
                )}
              </div>
            ) : hasValuationReports ? (
              // Show profile prompt when valuation exists but no profile
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    // Profile creation not implemented in valuation-tester, just navigate to report
                    if (reportId) {
                      router.push(`/reports/${reportId}`)
                    }
                  }}
                  onMouseEnter={() => setHoveredBadge('profile')}
                  onMouseLeave={() => setHoveredBadge(null)}
                  className="w-10 h-10 bg-white hover:bg-muted rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 border-2 border-teal-500"
                >
                  <span className="text-xl">👤</span>
                </button>
                {hoveredBadge === 'profile' && (
                  <div className="absolute right-0 top-12 bg-popover text-foreground text-xs px-3 py-2 rounded-lg whitespace-nowrap z-20">
                    Guest user
                    <div className="absolute right-3 top-0 -translate-y-1/2 w-2 h-2 bg-popover rotate-45"></div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Center Content - Business Icon - Mobile Optimized */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl sm:text-8xl lg:text-9xl mb-2 sm:mb-4">
                {getBusinessTypeIcon(businessInfo.industry)}
              </div>
            </div>
          </div>

          {/* Bottom Overlay - Business Name and Info - Mobile Optimized */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-12 sm:pt-16 pb-3 sm:pb-5 px-3 sm:px-5">
            <div className="text-center">
              <h3 className="text-lg sm:text-xl font-bold text-white mb-1 leading-tight">
                {businessInfo.name}
              </h3>
              <p className="text-xs sm:text-sm text-white/90 leading-tight mb-2">
                {getBusinessTypeTitle(businessInfo.industry)}
              </p>

              {/* Compact Info Inside Card - Mobile Optimized */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs sm:text-sm gap-1 sm:gap-0 text-white/80">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span>📅 {businessInfo.foundedYear}</span>
                  <span className="hidden sm:inline">•</span>
                  <span>👥 {businessInfo.teamSize}</span>
                </div>
                <div>📍 {businessInfo.isRemote ? 'Remote' : businessInfo.location}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BusinessProfileCardV4
