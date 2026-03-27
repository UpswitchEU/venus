import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourceDataPanel } from './SourceDataPanel';
import { useSpotlightStore } from '../../store/useSpotlightStore';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
}));

describe('SourceDataPanel', () => {
  afterEach(() => {
    useSpotlightStore.setState({
      showSourcePanel: false,
      importQuality: null,
      orderedFlagDomIds: [],
      resolvedFields: new Set(),
      activeDomId: null,
      isSpotlightActive: false,
    });
  });

  it('renders separate provenance rows for the same field across fiscal years', async () => {
    act(() => {
      useSpotlightStore.setState({
        showSourcePanel: true,
        importQuality: {
          '2024': {
            confidence_score: 0.9,
            audit_flags: [],
            field_provenance: [
              {
                field: 'revenue',
                value: 1000,
                source_accounts: ['70'],
                mapping_method: 'direct',
              },
            ],
            total_accounts_processed: 1,
            accounts_mapped_directly: 1,
            accounts_fallback: 0,
            accounts_skipped: 0,
          },
          '2023': {
            confidence_score: 0.9,
            audit_flags: [],
            field_provenance: [
              {
                field: 'revenue',
                value: 500,
                source_accounts: ['700'],
                mapping_method: 'direct',
              },
            ],
            total_accounts_processed: 1,
            accounts_mapped_directly: 1,
            accounts_fallback: 0,
            accounts_skipped: 0,
          },
        },
      });
    });

    await act(async () => {
      render(<SourceDataPanel />);
    });

    expect(screen.getByText('FY 2024')).toBeInTheDocument();
    expect(screen.getByText('FY 2023')).toBeInTheDocument();
    expect(screen.getAllByText('Revenue')).toHaveLength(2);
  });

  it('auto-expands the active spotlight field row when the source panel opens', async () => {
    act(() => {
      useSpotlightStore.setState({
        showSourcePanel: true,
        activeDomId: 'revenue__2023',
        importQuality: {
          '2024': {
            confidence_score: 0.9,
            audit_flags: [],
            field_provenance: [
              {
                field: 'revenue',
                value: 1000,
                source_accounts: ['70'],
                mapping_method: 'direct',
              },
            ],
            total_accounts_processed: 1,
            accounts_mapped_directly: 1,
            accounts_fallback: 0,
            accounts_skipped: 0,
          },
          '2023': {
            confidence_score: 0.9,
            audit_flags: [],
            field_provenance: [
              {
                field: 'revenue',
                value: 500,
                source_accounts: ['700'],
                mapping_method: 'fallback',
              },
            ],
            total_accounts_processed: 1,
            accounts_mapped_directly: 0,
            accounts_fallback: 1,
            accounts_skipped: 0,
          },
        },
      });
    });

    await act(async () => {
      render(<SourceDataPanel />);
    });

    expect(screen.getByText('MAR 700')).toBeInTheDocument();
  });
});
