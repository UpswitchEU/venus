/**
 * Input Fields Skeleton
 *
 * Loading skeleton for form input fields - MATCHES ACTUAL FORM STRUCTURE.
 * Shows while input data is being restored from backend.
 * Matches: ValuationForm sections with dark theme (bg-zinc-900)
 *
 * @module components/skeletons/InputFieldsSkeleton
 */

import React from 'react'

export function InputFieldsSkeleton() {
  return (
    <div className="space-y-12 animate-pulse">
      {/* Basic Information Section */}
      <div className="space-y-6">
        <h3 className="h-6 w-40 bg-white/10 rounded mb-6 pb-2 border-b border-white/10" />

        <div className="grid grid-cols-1 gap-6">
          {/* Business Type Search - Full width */}
          <div className="space-y-2">
            <div className="h-4 w-36 bg-white/10 rounded" />
            <div className="h-12 w-full bg-white/5 border border-white/10 rounded-lg" />
          </div>

          {/* Company Name + Founding Year Grid */}
          <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="h-4 w-32 bg-white/10 rounded" />
              <div className="h-12 w-full bg-white/5 border border-white/10 rounded-lg" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-28 bg-white/10 rounded" />
              <div className="h-12 w-full bg-white/5 border border-white/10 rounded-lg" />
            </div>
          </div>

          {/* Country - Full width */}
          <div className="space-y-2">
            <div className="h-4 w-24 bg-white/10 rounded" />
            <div className="h-12 w-full bg-white/5 border border-white/10 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Ownership Structure Section */}
      <div className="space-y-6">
        <h3 className="h-6 w-48 bg-white/10 rounded mb-6 pb-2 border-b border-white/10" />

        <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="h-4 w-40 bg-white/10 rounded" />
            <div className="h-12 w-full bg-white/5 border border-white/10 rounded-lg" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-36 bg-white/10 rounded" />
            <div className="h-12 w-full bg-white/5 border border-white/10 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Financial Data Section */}
      <div className="space-y-6">
        <h3 className="h-6 w-36 bg-white/10 rounded mb-6 pb-2 border-b border-white/10" />

        <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-6">
          {/* Revenue */}
          <div className="space-y-2">
            <div className="h-4 w-32 bg-white/10 rounded" />
            <div className="h-12 w-full bg-white/5 border border-white/10 rounded-lg" />
            <div className="h-3 w-full bg-white/5 rounded" />
          </div>

          {/* EBITDA */}
          <div className="space-y-2">
            <div className="h-4 w-28 bg-white/10 rounded" />
            <div className="h-12 w-full bg-white/5 border border-white/10 rounded-lg" />
            <div className="h-3 w-full bg-white/5 rounded" />
          </div>
        </div>

        {/* Additional financial fields */}
        <div className="grid grid-cols-1 @4xl:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="h-4 w-32 bg-white/10 rounded" />
            <div className="h-12 w-full bg-white/5 border border-white/10 rounded-lg" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-28 bg-white/10 rounded" />
            <div className="h-12 w-full bg-white/5 border border-white/10 rounded-lg" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-36 bg-white/10 rounded" />
            <div className="h-12 w-full bg-white/5 border border-white/10 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Historical Data Section */}
      <div className="space-y-6">
        <h3 className="h-6 w-40 bg-white/10 rounded mb-6 pb-2 border-b border-white/10" />
        <div className="h-32 w-full bg-white/5 border border-white/10 rounded-lg" />
      </div>

      {/* Submit Button */}
      <div className="pt-6 border-t border-foreground/10">
        <div className="h-14 w-full bg-white/5 rounded-xl" />
      </div>
    </div>
  )
}
