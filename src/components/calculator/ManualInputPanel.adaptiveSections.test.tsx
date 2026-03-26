import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdaptiveSections } from './ManualInputPanel'

vi.mock('next-intl', () => ({
  useLocale: () => 'nl',
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values
      ? `${key}:${Object.entries(values)
          .map(([entryKey, value]) => `${entryKey}=${value}`)
          .join(',')}`
      : key,
}))

describe('AdaptiveSections', () => {
  const baseProps = {
    formData: {} as any,
    onFieldChange: vi.fn(),
    disabled: false,
  }

  it('renders the DCF and SaaS sections together when both rules apply', () => {
    render(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="dcf"
        businessCategory="saas_software"
      />
    )

    expect(screen.getByText('sections.dcfProjections')).toBeInTheDocument()
    expect(screen.getByText('sections.saasMetrics')).toBeInTheDocument()
    expect(screen.queryByText('sections.navAssetSchedule')).not.toBeInTheDocument()
  })

  it('removes method-specific sections when switching back to adaptive and restores them later', async () => {
    const { rerender } = render(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="dcf"
        businessCategory="saas_software"
      />
    )

    expect(screen.getByText('sections.dcfProjections')).toBeInTheDocument()

    rerender(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="upswitch_adaptive"
        businessCategory="saas_software"
      />
    )

    await waitFor(() => {
      expect(screen.queryByText('sections.dcfProjections')).not.toBeInTheDocument()
    })
    expect(screen.getByText('sections.saasMetrics')).toBeInTheDocument()

    rerender(
      <AdaptiveSections
        {...baseProps}
        effectiveMethod="dcf"
        businessCategory="saas_software"
      />
    )

    expect(screen.getByText('sections.dcfProjections')).toBeInTheDocument()
  })
})
