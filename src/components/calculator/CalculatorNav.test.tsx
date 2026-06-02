import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CalculatorNav } from './CalculatorNav'

vi.mock('next-intl', () => ({
  useLocale: () => 'nl',
  useTranslations: () => (key: string, values?: Record<string, number>) => {
    const translations: Record<string, string> = {
      'assistant.shortcut': '⌘K',
      'assistant.title': 'Assistent',
      'clientContext.exitClientView': 'Klantweergave verlaten',
      'common.actions.back': 'Terug',
      'common.actions.delete': 'Verwijderen',
      'common.continue': 'Doorgaan',
      'common.states.processing': 'Bezig',
      'common.time.justNow': 'Zojuist',
      'historyPanel.current': 'HUIDIG',
      'manualInput.methodSelector.adaptiveRecommended': 'Adaptief aanbevolen',
      'manualInput.methodSelector.adaptiveRecommendedPill': 'Adaptief',
      'manualInput.methodSelector.label': 'Methode',
      'manualInput.methodSelector.methods': 'methodes',
      'normalization.title': 'Normalisatie',
      'toast.newEstimation': 'Nieuwe Schatting',
      'valuation.currentVersion': 'Huidige versie',
      'valuation.draft': 'Concept',
      'valuation.new': 'Nieuwe schatting',
      'valuation.noRecent': 'Geen recente schattingen',
      'valuation.recentValuations': 'Recente Schattingen',
      'valuation.versionHistoryTooltip': 'Open versiegeschiedenis en waarderingsbandbreedte',
      'valuation.versions': 'Versiegeschiedenis',
    }

    if (key === 'common.time.minutesAgo') return `${values?.count ?? 0}m geleden`
    if (key === 'common.time.hoursAgo') return `${values?.count ?? 0}u geleden`
    if (key === 'common.time.daysAgo') return `${values?.count ?? 0}d geleden`
    if (key === 'historyPanel.versionsCount') {
      return `${values?.count ?? 0} ${values?.count === 1 ? 'versie' : 'versies'} · Audit trail`
    }

    return translations[key] ?? key
  },
}))

describe('CalculatorNav', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the draft chip in the recent valuation title row without crowding the timestamp', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-02T09:37:30.000Z'))

    render(
      <CalculatorNav
        companyName="Restaurant Decan"
        recentValuations={[
          {
            id: 'report-1',
            companyName: 'Restaurant Decan',
            updatedAt: new Date('2026-06-02T09:37:01.000Z'),
            isDraft: true,
          },
        ]}
        activeReportId="report-1"
        onSelectValuation={vi.fn()}
        onNewValuation={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Restaurant Decan/i }))

    expect(screen.getByText('Recente Schattingen')).toBeInTheDocument()
    const rowTitle = screen.getByText('Restaurant Decan', { selector: 'p' })
    const titleRow = rowTitle.parentElement

    expect(titleRow).not.toBeNull()
    expect(within(titleRow as HTMLElement).getByText('Concept')).toBeInTheDocument()
    expect(screen.getByText('Zojuist')).toBeInTheDocument()
    expect(rowTitle.closest('button')).toHaveAttribute('aria-current', 'page')
  })

  it('marks the displayed valuation version as current when no explicit version is selected', () => {
    render(
      <CalculatorNav
        companyName="Restaurant Decan"
        hasReport
        valuationVersions={[
          {
            id: 'version-1',
            label: 'v1',
            askPrice: 360050,
            priceRange: { min: 288000, max: 485000 },
            timestamp: new Date('2026-06-02T09:37:00.000Z'),
          },
          {
            id: 'version-2',
            label: 'v2',
            askPrice: 389000,
            priceRange: { min: 312000, max: 510000 },
            timestamp: new Date('2026-06-02T09:38:00.000Z'),
          },
        ]}
        onSelectVersion={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTitle('Open versiegeschiedenis en waarderingsbandbreedte'))

    expect(screen.getByText('Versiegeschiedenis')).toBeInTheDocument()
    expect(screen.getByText('2 versies · Audit trail')).toBeInTheDocument()

    const currentVersionRow = screen.getByText('v1').closest('button')
    const nextVersionRow = screen.getByText('v2').closest('button')

    expect(currentVersionRow).toHaveAttribute('aria-current', 'true')
    expect(within(currentVersionRow as HTMLElement).getByText('HUIDIG')).toBeInTheDocument()
    expect(nextVersionRow).not.toHaveAttribute('aria-current')
  })

  it('shows a polished current-version fallback when only a valuation summary exists', () => {
    render(
      <CalculatorNav
        companyName="Restaurant Decan"
        hasReport
        valuationSummary={{
          askPrice: 389000,
          priceRange: { min: 288000, max: 485000 },
          confidence: 'high',
        }}
      />
    )

    fireEvent.click(screen.getByTitle('Open versiegeschiedenis en waarderingsbandbreedte'))

    expect(screen.getByText('Huidige versie')).toBeInTheDocument()
    expect(screen.getByText('1 versie · Audit trail')).toBeInTheDocument()
    expect(screen.getByText('HUIDIG')).toBeInTheDocument()
    expect(screen.getAllByText('€389K')).toHaveLength(2)
    expect(screen.getAllByText('€288K–€485K')).toHaveLength(2)
  })
})
