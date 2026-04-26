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
      provider: null,
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

  it('renders provider attribution and freshness in header when provider is set', async () => {
    act(() => {
      useSpotlightStore.setState({
        showSourcePanel: true,
        provider: 'yuki',
        importQuality: {
          '2025': {
            confidence_score: 0.9,
            audit_flags: [],
            field_provenance: [
              {
                field: 'revenue',
                value: 1950000,
                source_accounts: ['70'],
                mapping_method: 'direct',
              },
            ],
            total_accounts_processed: 36,
            accounts_mapped_directly: 36,
            accounts_fallback: 0,
            accounts_skipped: 0,
            fetched_at: '2026-04-26T09:00:00Z',
          },
        },
      });
    });

    await act(async () => {
      render(<SourceDataPanel />);
    });

    expect(screen.getByText('via Yuki')).toBeInTheDocument();
    expect(screen.getByText('36 direct')).toBeInTheDocument();
    expect(screen.queryByText(/fallback/i)).not.toBeInTheDocument();
  });

  it('omits provider attribution when provider is null', async () => {
    act(() => {
      useSpotlightStore.setState({
        showSourcePanel: true,
        provider: null,
        importQuality: {
          '2025': {
            confidence_score: 0.9,
            audit_flags: [],
            field_provenance: [
              {
                field: 'revenue',
                value: 100,
                source_accounts: ['70'],
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

    expect(screen.queryByText(/via /i)).not.toBeInTheDocument();
  });

  it('flags fiscal years with no field mappings', async () => {
    act(() => {
      useSpotlightStore.setState({
        showSourcePanel: true,
        importQuality: {
          '2024': {
            confidence_score: 0.5,
            audit_flags: [],
            field_provenance: [],
            total_accounts_processed: 5,
            accounts_mapped_directly: 0,
            accounts_fallback: 0,
            accounts_skipped: 5,
          },
          '2025': {
            confidence_score: 0.9,
            audit_flags: [],
            field_provenance: [
              {
                field: 'revenue',
                value: 100,
                source_accounts: ['70'],
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

    expect(screen.getByText(/No field mappings for: FY 2024/)).toBeInTheDocument();
  });

  it('renders unmapped ledger lines when present', async () => {
    act(() => {
      useSpotlightStore.setState({
        showSourcePanel: true,
        importQuality: {
          '2025': {
            confidence_score: 0.9,
            audit_flags: [],
            field_provenance: [
              {
                field: 'revenue',
                value: 100,
                source_accounts: ['70'],
                mapping_method: 'direct',
              },
            ],
            total_accounts_processed: 2,
            accounts_mapped_directly: 1,
            accounts_fallback: 0,
            accounts_skipped: 1,
            unmapped_ledger_lines: [
              { account_code: '999000', description: 'Diverse niet-toewijsbaar' },
            ],
          },
        },
      });
    });

    await act(async () => {
      render(<SourceDataPanel />);
    });

    // Section header + collapsed row appear immediately. Description is inside the
    // closed accordion so we only assert the section header and the count badge.
    expect(screen.getByText('Unmapped accounts')).toBeInTheDocument();
    expect(screen.getByText('Unmapped')).toBeInTheDocument();
  });
});
