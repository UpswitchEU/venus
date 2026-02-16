import { TrendingUp } from 'lucide-react'
import React from 'react'

export const ValuationEmptyState: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-canvas">
      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-foreground/10 flex items-center justify-center mb-3 sm:mb-4 transition-all duration-300 hover:scale-110">
        <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-slate-ink">Reports will appear here</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm leading-relaxed">
        Start a conversation in the chat to generate insights and reports about your valuation
      </p>
    </div>
  )
}
