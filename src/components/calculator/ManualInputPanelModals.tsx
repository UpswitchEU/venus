'use client'

import { useTranslations } from 'next-intl'
import { BizzcontrolImportModal } from '@/components/integrations/BizzcontrolImportModal'
import { CSVUploadCard, type ParsedCSVData } from '@/components/integrations/CSVUploadCard'
import { OctopusImportModal } from '@/components/integrations/OctopusImportModal'
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/design-system/components/Modal'
import type { AccountingAdministration } from '@/services/api/accounting'

type ImportHistoryRange = '3' | '5'

interface AccountingImportModalController {
  open: boolean
  setOpen: (open: boolean) => void
  isLoadingCompanies: boolean
  isImporting: boolean
  error: string | null
  companies: AccountingAdministration[]
  selectedCompanyId: string
  setSelectedCompanyId: (companyId: string) => void
  historyRange: ImportHistoryRange
  setHistoryRange: (range: ImportHistoryRange) => void
  handleConfirmImport: () => void | Promise<void>
  manualOverride: boolean
  setManualOverride: (manualOverride: boolean) => void
}

interface ManualInputPanelModalsProps {
  showCSVUpload: boolean
  setShowCSVUpload: (open: boolean) => void
  handleCSVFileSelected: (file: File, parsedData: ParsedCSVData) => void
  bizzcontrolImport: AccountingImportModalController
  octopusImport: AccountingImportModalController
  historicalYearPendingRemove: string | null
  setHistoricalYearPendingRemove: (year: string | null) => void
  commitRemoveHistoricalYear: (year: string) => void
  showForecastRemovalConfirm: boolean
  setShowForecastRemovalConfirm: (open: boolean) => void
  setSelectedMethod: (method: string) => void
  markDcfForecastSyncPrevMethod: (method: string) => void
  onConfirmRemoveForecastYears: () => void
}

export function ManualInputPanelModals({
  showCSVUpload,
  setShowCSVUpload,
  handleCSVFileSelected,
  bizzcontrolImport,
  octopusImport,
  historicalYearPendingRemove,
  setHistoricalYearPendingRemove,
  commitRemoveHistoricalYear,
  showForecastRemovalConfirm,
  setShowForecastRemovalConfirm,
  setSelectedMethod,
  markDcfForecastSyncPrevMethod,
  onConfirmRemoveForecastYears,
}: ManualInputPanelModalsProps) {
  const t = useTranslations()
  const mi = useTranslations('manualInput')

  return (
    <>
      <Modal open={showCSVUpload} onOpenChange={setShowCSVUpload}>
        <ModalContent className="max-w-2xl">
          <ModalHeader>
            <ModalTitle>{mi('importModal.title')}</ModalTitle>
            <ModalDescription>{mi('importModal.description')}</ModalDescription>
          </ModalHeader>

          <div className="py-4">
            <CSVUploadCard
              onFileSelected={handleCSVFileSelected}
              onSkip={() => setShowCSVUpload(false)}
            />
          </div>
        </ModalContent>
      </Modal>

      <BizzcontrolImportModal
        open={bizzcontrolImport.open}
        onOpenChange={bizzcontrolImport.setOpen}
        isLoadingCompanies={bizzcontrolImport.isLoadingCompanies}
        isImporting={bizzcontrolImport.isImporting}
        error={bizzcontrolImport.error}
        companies={bizzcontrolImport.companies}
        selectedCompanyId={bizzcontrolImport.selectedCompanyId}
        onSelectedCompanyIdChange={bizzcontrolImport.setSelectedCompanyId}
        historyRange={bizzcontrolImport.historyRange}
        onHistoryRangeChange={bizzcontrolImport.setHistoryRange}
        onImport={bizzcontrolImport.handleConfirmImport}
        manualOverride={bizzcontrolImport.manualOverride}
        onManualOverrideChange={bizzcontrolImport.setManualOverride}
      />

      <OctopusImportModal
        open={octopusImport.open}
        onOpenChange={octopusImport.setOpen}
        isLoadingCompanies={octopusImport.isLoadingCompanies}
        isImporting={octopusImport.isImporting}
        error={octopusImport.error}
        companies={octopusImport.companies}
        selectedCompanyId={octopusImport.selectedCompanyId}
        onSelectedCompanyIdChange={octopusImport.setSelectedCompanyId}
        historyRange={octopusImport.historyRange}
        onHistoryRangeChange={octopusImport.setHistoryRange}
        onImport={octopusImport.handleConfirmImport}
        manualOverride={octopusImport.manualOverride}
        onManualOverrideChange={octopusImport.setManualOverride}
      />

      <Modal
        open={historicalYearPendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) setHistoricalYearPendingRemove(null)
        }}
      >
        <ModalContent className="max-w-sm">
          <ModalHeader>
            <ModalTitle>
              {historicalYearPendingRemove !== null
                ? mi('removeHistoricalYearConfirmTitle', { year: historicalYearPendingRemove })
                : ''}
            </ModalTitle>
            <ModalDescription>
              {historicalYearPendingRemove !== null
                ? mi('removeHistoricalYearConfirmDescription', {
                    year: historicalYearPendingRemove,
                  })
                : ''}
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <button
              type="button"
              onClick={() => setHistoricalYearPendingRemove(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-foreground/10 text-foreground hover:bg-foreground/[0.03] transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (historicalYearPendingRemove !== null) {
                  commitRemoveHistoricalYear(historicalYearPendingRemove)
                }
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              {t('common.actions.confirm')}
            </button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        open={showForecastRemovalConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMethod('dcf')
            markDcfForecastSyncPrevMethod('dcf')
          }
          setShowForecastRemovalConfirm(open)
        }}
      >
        <ModalContent className="max-w-sm">
          <ModalHeader>
            <ModalTitle>{mi('removeForecastPrompt')}</ModalTitle>
            <ModalDescription>{mi('removeForecastDescription')}</ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <button
              type="button"
              onClick={() => {
                setSelectedMethod('dcf')
                markDcfForecastSyncPrevMethod('dcf')
                setShowForecastRemovalConfirm(false)
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-foreground/10 text-foreground hover:bg-foreground/[0.03] transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirmRemoveForecastYears()
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              {t('common.actions.confirm')}
            </button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}
