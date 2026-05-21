import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DcfFcffOnlyTable } from './DcfFcffOnlyTable'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values
      ? `${key}:${Object.entries(values)
          .map(([entryKey, value]) => `${entryKey}=${value}`)
          .join(',')}`
      : key,
}))

describe('DcfFcffOnlyTable', () => {
  it('emits undefined when a yearly FCFF value is cleared', () => {
    const onChange = vi.fn()

    render(
      <DcfFcffOnlyTable
        forecastRows={[{ year: '2025', revenue: 0, ebitda: 0, free_cash_flow: 125_000 }]}
        onChange={onChange}
      />
    )

    fireEvent.change(screen.getByLabelText('dcfFcffOnlyTable.inputAria:year=2025'), {
      target: { value: '' },
    })

    expect(onChange).toHaveBeenCalledWith('2025', undefined)
  })

  it('keeps intentional zero as a valid FCFF value', () => {
    const onChange = vi.fn()

    render(
      <DcfFcffOnlyTable
        forecastRows={[{ year: '2025', revenue: 0, ebitda: 0, free_cash_flow: 125_000 }]}
        onChange={onChange}
      />
    )

    fireEvent.change(screen.getByLabelText('dcfFcffOnlyTable.inputAria:year=2025'), {
      target: { value: '0' },
    })

    expect(onChange).toHaveBeenCalledWith('2025', 0)
  })

  it('emits APV tax shield changes by forecast-year index', () => {
    const onChange = vi.fn()
    const onTaxShieldChange = vi.fn()

    render(
      <DcfFcffOnlyTable
        forecastRows={[{ year: '2025', revenue: 0, ebitda: 0, free_cash_flow: 125_000 }]}
        taxShieldProjections={[1_500]}
        onChange={onChange}
        onTaxShieldChange={onTaxShieldChange}
      />
    )

    fireEvent.change(screen.getByLabelText('dcfFcffOnlyTable.taxShieldInputAria:year=2025'), {
      target: { value: '1125' },
    })

    expect(onTaxShieldChange).toHaveBeenCalledWith(0, 1125)
  })
})
