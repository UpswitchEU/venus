/**
 * Versions Skeleton
 *
 * Loading skeleton for version history - MATCHES ACTUAL VERSION TIMELINE.
 * Shows while versions are being loaded from backend.
 * Matches: VersionTimeline component with vertical connector and cards
 *
 * @module components/skeletons/VersionsSkeleton
 */

import React from 'react'

export function VersionsSkeleton() {
  return (
    <div className="w-full p-6 animate-pulse">
      <div className="relative">
        {/* Version timeline items */}
        {[1, 2, 3].map((version, index) => (
          <div key={version} className="relative pb-8">
            {/* Vertical connector line */}
            {index < 2 && (
              <div className="absolute left-5 top-11 bottom-0 w-0.5 bg-foreground/10" />
            )}

            {/* Version card */}
            <div className="relative bg-card border border-foreground/10 rounded-lg p-4 hover:shadow-md transition-shadow">
              {/* Version header */}
              <div className="flex items-start gap-4 mb-3">
                {/* Version badge */}
                <div className="flex-shrink-0">
                  <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <div className="h-5 w-5 bg-primary/20 rounded" />
                  </div>
                </div>

                {/* Version info */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="h-5 w-24 bg-foreground/10 rounded" />
                    <div className="h-4 w-32 bg-muted rounded" />
                  </div>
                  <div className="h-4 w-40 bg-muted rounded" />
                </div>
              </div>

              {/* Version changes */}
              <div className="space-y-2 ml-14">
                <div className="h-4 w-3/4 bg-muted rounded" />
                <div className="h-4 w-2/3 bg-muted rounded" />
              </div>

              {/* Valuation card */}
              <div className="mt-4 ml-14 bg-navy-50 border border-navy-200 rounded-lg p-3">
                <div className="space-y-2">
                  <div className="h-4 w-48 bg-navy-100 rounded" />
                  <div className="h-6 w-40 bg-navy-200 rounded" />
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div className="h-4 w-full bg-navy-100 rounded" />
                    <div className="h-4 w-full bg-navy-100 rounded" />
                    <div className="h-4 w-full bg-navy-100 rounded" />
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-4 ml-14">
                <div className="h-8 w-20 bg-foreground/10 rounded" />
                <div className="h-8 w-24 bg-foreground/10 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
