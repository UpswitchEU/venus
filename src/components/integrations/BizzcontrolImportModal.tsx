'use client'

import { Building2, Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AuroraButton } from '@/design-system/components/Button'
import { AuroraSelect } from '@/design-system/components/Select'
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/design-system/components/Modal'
import type { AccountingAdministration } from '@/services/api/accounting'
import { buildMercuryIntegrationsUrl } from '@/utils/getMercuryUrl'

interface BizzcontrolImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  locale: string
  isLoadingCompanies: boolean
  isImporting: boolean
  error?: string | null
  companies: AccountingAdministration[]
  selectedCompanyId: string
  onSelectedCompanyIdChange: (companyId: string) => void
  historyRange: '3' | '5'
  onHistoryRangeChange: (value: '3' | '5') => void
  onImport: () => void | Promise<void>
  manualOverride: boolean
  onManualOverrideChange: (value: boolean) => void
}

export function BizzcontrolImportModal({
  open,
  onOpenChange,
  locale,
  isLoadingCompanies,
  isImporting,
  error,
  companies,
  selectedCompanyId,
  onSelectedCompanyIdChange,
  historyRange,
  onHistoryRangeChange,
  onImport,
  manualOverride,
  onManualOverrideChange,
}: BizzcontrolImportModalProps) {
  const t = useTranslations('manualInput.bizzcontrol')
  const [search, setSearch] = useState('')

  const companyOptions = useMemo(
    () =>
      companies
        .filter((company) => company.name.toLowerCase().includes(search.trim().toLowerCase()))
        .map((company) => ({
          value: company.administration_id,
          label: company.name,
        })),
    [companies, search]
  )

  const canImport = !!selectedCompanyId && !isImporting && !isLoadingCompanies

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-xl" variant="glass" size="lg">
        <ModalHeader>
          <ModalTitle>{t('title')}</ModalTitle>
          <ModalDescription>{t('description')}</ModalDescription>
        </ModalHeader>

        <div className="space-y-4">
          <p className="text-sm text-foreground/70">
            {t('connectHint')}{' '}
            <a
              href={buildMercuryIntegrationsUrl(locale, { accountingProvider: 'bizzcontrol' })}
              className="text-primary underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('openIntegrationsSettings')}
            </a>
          </p>

          <div>
            <label className="text-sm font-medium text-foreground">{t('searchCompanies')}</label>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-1 w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"
              placeholder={t('searchPlaceholder')}
            />
          </div>

          {isLoadingCompanies ? (
            <div className="flex items-center gap-2 text-sm text-foreground/60">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('loadingCompanies')}
            </div>
          ) : (
            <AuroraSelect
              label={t('companyLabel')}
              value={selectedCompanyId}
              onChange={onSelectedCompanyIdChange}
              options={companyOptions}
              placeholder={t('companyPlaceholder')}
            />
          )}

          <AuroraSelect
            label={t('historyRange')}
            value={historyRange}
            onChange={(v) => onHistoryRangeChange(v as '3' | '5')}
            options={[
              { value: '3', label: t('years3') },
              { value: '5', label: t('years5') },
            ]}
          />

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={manualOverride}
              onChange={(e) => onManualOverrideChange(e.target.checked)}
              className="rounded border-foreground/20"
            />
            {t('manualOverride')}
          </label>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <p className="text-xs text-foreground/55">{t('fetchPhasesHint')}</p>
        </div>

        <ModalFooter className="gap-2">
          <AuroraButton type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </AuroraButton>
          <AuroraButton
            type="button"
            onClick={() => void onImport()}
            disabled={!canImport}
            className="gap-2"
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
            {t('importCta')}
          </AuroraButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
