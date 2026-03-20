import { describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import CalculatorPage from './page';

describe('venus /calculator redirect', () => {
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
      '/en/reports/new?clientId=client-123&spotlight=1&focusField=ebitda&flagYear=2024&source=mercury',
    );
  });
});
