import type { ReportState, ValuationPackage } from './types'

export function shouldHydrateBootstrapPackage(
  report: Pick<ReportState, 'mode' | 'reportReady'>,
  valuationPackage?: ValuationPackage
): boolean {
  return report.mode === 'existing' && report.reportReady !== false && !!valuationPackage
}
