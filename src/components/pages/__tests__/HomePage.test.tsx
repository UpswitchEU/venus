/**
 * HomePage smoke tests — Next.js / next-intl (no react-router-dom).
 */

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from '../HomePage'

vi.mock('@/lib/analytics', () => ({
  identifyUser: vi.fn(),
  trackReportCreate: vi.fn(),
  trackReportOpen: vi.fn(),
  trackSessionStart: vi.fn(),
}))

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: null }),
}))

vi.mock('../../../stores/clientContext', () => ({
  useClientContext: () => ({
    isActingAsClient: false,
    client: null,
    getContextHeaders: () => ({}),
  }),
}))

vi.mock('../../../store/useReportsStore', () => ({
  useReportsStore: () => ({
    reports: [],
    loading: false,
    fetchReports: vi.fn(),
    deleteReport: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const copy: Record<string, string> = {
      'home.hero.title': 'Title',
      'home.hero.titleLine2': 'Line2',
      'home.hero.subtitle': 'Subtitle',
      'home.hero.cta': 'CTA',
      'home.hero.placeholder': 'Placeholder',
      'home.hero.trustSignal': 'Trust',
      'home.flows.manual': 'Manual Input',
      'home.flows.conversational': 'AI-Guided Valuation',
    }
    return copy[key] ?? key
  },
}))

vi.mock('../../MinimalHeader', () => ({
  MinimalHeader: () => <header data-testid="minimal-header" />,
}))

vi.mock('../../VideoBackground', () => ({
  VideoBackground: () => null,
}))

vi.mock('../../../features/reports', () => ({
  RecentReportsSection: () => <div data-testid="recent-reports" />,
}))

vi.mock('../../../utils', () => ({
  ScrollToTop: () => null,
}))

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders mode toggle buttons for manual and conversational flow', () => {
    render(<HomePage />)

    expect(screen.getByRole('button', { name: 'Manual Input' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Conversational Mode' })).toBeInTheDocument()
  })

  it('renders header and hero form', () => {
    render(<HomePage />)

    expect(screen.getByTestId('minimal-header')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Placeholder')).toBeInTheDocument()
  })
})
