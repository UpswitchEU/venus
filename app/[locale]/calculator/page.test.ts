import { describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import CalculatorPage from './page';

describe('venus /calculator redirect', () => {
  it('preserves token on /calculator → /reports/new', async () => {
    await CalculatorPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({
        token: 'handoff_xyz',
        source: 'mercury',
      }),
    })
    expect(redirectMock).toHaveBeenCalledWith('/en/reports/new?token=handoff_xyz&source=mercury')
  })

  it('preserves guided-resolution params when redirecting to reports/new', async () => {
    await CalculatorPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({
        clientId: 'client-123',
        spotlight: '1',
        focusField: 'ebitda',
        flagYear: '2024',
        source: 'mercury',
      }),
    });

    expect(redirectMock).toHaveBeenCalledWith(
      '/en/reports/new?clientId=client-123&source=mercury&spotlight=1&focusField=ebitda&flagYear=2024',
    );
  });

  it('strips non-allowlisted params when redirecting to reports/new', async () => {
    await CalculatorPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({
        clientId: 'client-123',
        source: 'mercury',
        utm_source: 'twitter',
        arbitrary: 'nope',
      }),
    })

    expect(redirectMock).toHaveBeenCalledWith('/en/reports/new?clientId=client-123&source=mercury')
  })

  it('preserves session_key on report deep link and drops junk params', async () => {
    await CalculatorPage({
      params: Promise.resolve({ locale: 'nl' }),
      searchParams: Promise.resolve({
        reportId: 'c61f49cf-3320-41d8-84c5-e4f874edaad2',
        clientId: 'rel_1',
        session_key: 'val_1700000000000_abc',
        utm_campaign: 'x',
      }),
    })

    expect(redirectMock).toHaveBeenCalledWith(
      '/nl/reports/c61f49cf-3320-41d8-84c5-e4f874edaad2?clientId=rel_1&session_key=val_1700000000000_abc',
    )
  })

  it('preserves version on report deep link', async () => {
    await CalculatorPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({
        reportId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        clientId: 'c1',
        version: '2',
      }),
    })

    expect(redirectMock).toHaveBeenCalledWith(
      '/en/reports/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee?clientId=c1&version=2',
    )
  })
})
