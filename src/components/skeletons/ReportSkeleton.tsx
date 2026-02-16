/**
 * Report Skeleton
 *
 * Loading skeleton for main HTML report - MATCHES ACTUAL REPORT STRUCTURE.
 * Shows while report is being loaded from backend.
 * Matches: Professional word-style document (Times New Roman, print-friendly)
 *
 * @module components/skeletons/ReportSkeleton
 */

import React from 'react'

export function ReportSkeleton() {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto p-8 animate-pulse">
        {/* Document Header - mimics professional report */}
        <div className="space-y-4 mb-12 pb-6 border-b-2 border-foreground/10">
          <div className="h-10 w-3/4 bg-foreground/10 rounded" />
          <div className="h-5 w-1/2 bg-foreground/5 rounded" />
          <div className="h-4 w-1/3 bg-foreground/5 rounded" />
        </div>

        {/* Executive Summary Section */}
        <div className="space-y-4 mb-10">
          <div className="h-7 w-1/3 bg-foreground/15 rounded" />
          <div className="space-y-3">
            <div className="h-4 w-full bg-foreground/5 rounded" />
            <div className="h-4 w-11/12 bg-foreground/5 rounded" />
            <div className="h-4 w-5/6 bg-foreground/5 rounded" />
            <div className="h-4 w-full bg-foreground/5 rounded" />
            <div className="h-4 w-4/5 bg-foreground/5 rounded" />
          </div>
        </div>

        {/* Valuation Results Section */}
        <div className="space-y-4 mb-10">
          <div className="h-7 w-2/5 bg-foreground/15 rounded" />

          {/* Results table */}
          <div className="border border-foreground/10 rounded-lg p-4 space-y-3">
            <div className="flex justify-between">
              <div className="h-5 w-1/3 bg-foreground/10 rounded" />
              <div className="h-5 w-1/4 bg-foreground/10 rounded" />
            </div>
            <div className="flex justify-between">
              <div className="h-5 w-1/3 bg-foreground/5 rounded" />
              <div className="h-5 w-1/4 bg-foreground/5 rounded" />
            </div>
            <div className="flex justify-between">
              <div className="h-5 w-1/3 bg-foreground/10 rounded" />
              <div className="h-5 w-1/4 bg-foreground/10 rounded" />
            </div>
            <div className="flex justify-between">
              <div className="h-5 w-1/3 bg-foreground/5 rounded" />
              <div className="h-5 w-1/4 bg-foreground/5 rounded" />
            </div>
          </div>
        </div>

        {/* Methodology Section */}
        <div className="space-y-4 mb-10">
          <div className="h-7 w-1/3 bg-foreground/15 rounded" />
          <div className="space-y-3">
            <div className="h-4 w-full bg-foreground/5 rounded" />
            <div className="h-4 w-5/6 bg-foreground/5 rounded" />
            <div className="h-4 w-11/12 bg-foreground/5 rounded" />
          </div>
        </div>

        {/* Financial Analysis Section */}
        <div className="space-y-4 mb-10">
          <div className="h-7 w-2/5 bg-foreground/15 rounded" />
          <div className="space-y-3">
            <div className="h-4 w-full bg-foreground/5 rounded" />
            <div className="h-4 w-4/5 bg-foreground/5 rounded" />
            <div className="h-4 w-11/12 bg-foreground/5 rounded" />
            <div className="h-4 w-3/4 bg-foreground/5 rounded" />
          </div>

          {/* Chart placeholder */}
          <div className="h-64 w-full bg-foreground/5 rounded-lg mt-4" />
        </div>

        {/* Appendix Section */}
        <div className="space-y-4">
          <div className="h-7 w-1/4 bg-foreground/15 rounded" />
          <div className="space-y-3">
            <div className="h-4 w-full bg-foreground/5 rounded" />
            <div className="h-4 w-5/6 bg-foreground/5 rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}
