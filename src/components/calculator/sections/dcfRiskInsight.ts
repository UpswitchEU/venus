export interface DcfRiskInsight {
  severity: 'high' | 'critical'
  ownerRatioPct: number
  waccUpliftPct: number
  suggestedWaccPct: number | null
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function deriveDcfRiskInsight(args: {
  ownerManagers?: number
  fteEmployees?: number
  currentWaccPct?: number
  smartDefaultWaccPct?: number
}): DcfRiskInsight | null {
  const ownerManagers = isFiniteNumber(args.ownerManagers) ? args.ownerManagers : null
  const fteEmployees = isFiniteNumber(args.fteEmployees) ? args.fteEmployees : null

  if (ownerManagers == null || ownerManagers <= 0 || fteEmployees == null || fteEmployees < 0) {
    return null
  }

  const ownerRatio = fteEmployees === 0 ? 1 : ownerManagers / fteEmployees
  if (ownerRatio < 0.5) return null

  const severity = ownerRatio >= 0.8 || fteEmployees === 0 ? 'critical' : 'high'
  const waccUpliftPct = severity === 'critical' ? 2 : 1
  const baseWaccPct = isFiniteNumber(args.currentWaccPct)
    ? args.currentWaccPct
    : isFiniteNumber(args.smartDefaultWaccPct)
      ? args.smartDefaultWaccPct
      : null

  return {
    severity,
    ownerRatioPct: round1(ownerRatio * 100),
    waccUpliftPct,
    suggestedWaccPct: baseWaccPct == null ? null : round1(baseWaccPct + waccUpliftPct),
  }
}
