import { CalculatorShellSkeleton } from '../../../components/calculator'

export { CalculatorShellSkeleton }

export function ManualLayoutSessionError({
  message,
  reloadLabel,
  title,
}: {
  message: string
  reloadLabel: string
  title: string
}) {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="max-w-md mx-auto text-center">
        <div className="bg-destructive/20 border border-destructive/30 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-destructive mb-2">{title}</h3>
          <p className="text-destructive/80 mb-6">{message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-destructive hover:bg-destructive/90 text-white rounded-lg transition-colors font-medium"
          >
            {reloadLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
