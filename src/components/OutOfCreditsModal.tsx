import React from 'react'

interface OutOfCreditsModalProps {
  isOpen: boolean
  onClose: () => void
  onSignUp: () => void
  onTryManual: () => void
}

export const OutOfCreditsModal: React.FC<OutOfCreditsModalProps> = ({
  isOpen,
  onClose,
  onSignUp,
  onTryManual,
}) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 max-w-md w-full mx-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-destructive/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-destructive text-2xl">🔒</span>
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">You've Used All 3 Free Credits!</h2>

          <p className="text-zinc-400 mb-6">
            You've completed 3 AI-guided valuations. Sign up to get 3 more free credits and save
            your reports forever.
          </p>

          <div className="space-y-3">
            <button
              onClick={onSignUp}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Sign Up for Free (3 More Credits)
            </button>

            <button
              onClick={onTryManual}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-zinc-300 font-medium py-3 px-4 rounded-lg transition-colors"
            >
              Try Manual Entry (Always Free)
            </button>

            <button
              onClick={onClose}
              className="w-full text-zinc-500 hover:text-zinc-400 font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Maybe Later
            </button>
          </div>

          <div className="mt-6 p-4 bg-zinc-800/50 rounded-lg">
            <p className="text-xs text-zinc-400">
              <span className="text-green-400">✓</span> Sign up is completely free
              <br />
              <span className="text-green-400">✓</span> Get 3 more AI-guided valuations
              <br />
              <span className="text-green-400">✓</span> Save reports forever
              <br />
              <span className="text-green-400">✓</span> No credit card required
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
