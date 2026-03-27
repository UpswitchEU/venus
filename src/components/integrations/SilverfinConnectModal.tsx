'use client'

import { Building2, Loader2, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AuroraButton } from '@/design-system/components/Button'
import { AuroraInput } from '@/design-system/components/Input'
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/design-system/components/Modal'
import { AuroraSelect } from '@/design-system/components/Select'
import type { AccountingAdministration } from '@/services/api/accounting'

interface SilverfinConnectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isConnected: boolean
  isConnecting: boolean
  isLoadingCompanies: boolean
  isImporting: boolean
  error?: string | null
  firmId: string
  onFirmIdChange: (firmId: string) => void
  companies: AccountingAdministration[]
  selectedCompanyId: string
  onSelectedCompanyIdChange: (companyId: string) => void
  historyRange: '3' | '5'
  onHistoryRangeChange: (value: '3' | '5') => void
  onStartOAuth: () => void | Promise<void>
  onImport: () => void | Promise<void>
}

export function SilverfinConnectModal({
  open,
  onOpenChange,
  isConnected,
  isConnecting,
  isLoadingCompanies,
  isImporting,
  error,
  firmId,
  onFirmIdChange,
  companies,
  selectedCompanyId,
  onSelectedCompanyIdChange,
  historyRange,
  onHistoryRangeChange,
  onStartOAuth,
  onImport,
}: SilverfinConnectModalProps) {
  const t = useTranslations('manualInput.silverfin')
  const [search, setSearch] = useState('')
  const [manualOverride, setManualOverride] = useState(false)
  const firmIdReady = firmId.trim().length > 0

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

  const canImport = isConnected && !!selectedCompanyId && !isImporting && !isLoadingCompanies

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-2xl" variant="glass" size="xl">
        <ModalHeader>
          <ModalTitle>{t('title')}</ModalTitle>
          <ModalDescription>{t('description')}</ModalDescription>
        </ModalHeader>

        <div className="space-y-5">
          <div className="rounded-2xl border border-primary/15 bg-primary/[0.05] p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{t('adjustedValueTitle')}</p>
                <p className="text-sm text-foreground/70">{t('adjustedValueDescription')}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3">
              <AuroraInput
                label={t('firmIdLabel')}
                value={firmId}
                onChange={(event) => onFirmIdChange(event.target.value)}
                placeholder={t('firmIdPlaceholder')}
                disabled={isConnecting || isImporting}
                autoComplete="off"
              />
              <p className="text-xs text-foreground/55">{t('firmIdHint')}</p>

              <AuroraButton
                type="button"
                onClick={() => void onStartOAuth()}
                disabled={isConnecting || isImporting || !firmIdReady}
                className="w-full"
              >
                {isConnecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Building2 className="mr-2 h-4 w-4" />
                )}
                {isConnected ? t('reconnectCta') : t('connectCta')}
              </AuroraButton>

              <AuroraInput
                label={t('searchLabel')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                disabled={!isConnected || isLoadingCompanies}
              />

              <AuroraSelect
                label={t('companyLabel')}
                options={companyOptions}
                value={selectedCompanyId}
                onChange={(value) => onSelectedCompanyIdChange(value)}
                searchable
                disabled={!isConnected || isLoadingCompanies}
                placeholder={t('companyPlaceholder')}
                searchPlaceholder={t('searchPlaceholder')}
              />
            </div>

            <div className="space-y-3 rounded-2xl border border-foreground/10 bg-background/60 p-4">
              <AuroraSelect
                label={t('historyLabel')}
                value={historyRange}
                onChange={(value) => onHistoryRangeChange(value as '3' | '5')}
                options={[
                  { value: '3', label: t('history3') },
                  { value: '5', label: t('history5') },
                ]}
                disabled={!isConnected || isImporting}
              />

              <label className="flex items-start gap-3 rounded-xl border border-foreground/10 px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={manualOverride}
                  onChange={(event) => setManualOverride(event.target.checked)}
                />
                <span className="text-foreground/70">{t('manualOverride')}</span>
              </label>

              <div className="rounded-xl bg-foreground/[0.04] px-3 py-3 text-sm text-foreground/65">
                {isLoadingCompanies ? t('loadingCompanies') : t('readyHint')}
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/[0.06] px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {isImporting ? (
            <div className="rounded-2xl border border-foreground/10 bg-background/60 px-4 py-4">
              <div className="flex items-center gap-3 text-sm text-foreground/70">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('loadingImport')}</span>
              </div>
            </div>
          ) : null}

          {manualOverride ? (
            <div className="rounded-xl border border-foreground/10 bg-background/60 px-4 py-3 text-sm text-foreground/70">
              {t('manualOverrideDescription')}
            </div>
          ) : null}
        </div>

        <ModalFooter>
          <AuroraButton type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </AuroraButton>
          <AuroraButton type="button" onClick={() => void onImport()} disabled={!canImport}>
            {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('importCta')}
          </AuroraButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
