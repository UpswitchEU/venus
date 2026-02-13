/**
 * Locale Routes Loading State
 *
 * Skeleton that maintains layout during navigation — prevents layout shift
 * when navigating between home, reports/new, reports/[id]. Matches Clarity's
 * smooth SPA feel.
 */

export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Content skeleton — matches valuation/home layout */}
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="w-full max-w-2xl mx-auto px-4 space-y-8">
          <div className="space-y-4">
            <div className="h-6 w-48 bg-foreground/10 rounded animate-pulse" />
            <div className="h-4 w-full max-w-md bg-foreground/10 rounded animate-pulse" />
          </div>
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 bg-foreground/[0.06] rounded-xl animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
