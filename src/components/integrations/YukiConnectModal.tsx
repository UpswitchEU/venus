'use client'

import { Building2, CheckCircle2, KeyRound, Loader2 } from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import { AuroraButton as Button } from '@/design-system/components/Button'
import { AuroraInput as Input } from '@/design-system/components/Input'
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/design-system/components/Modal'
import { AuroraSelect } from '@/design-system/components/Select'
import { accountingAPI, type AccountingBatchPayload } from '@/services/api/accounting'

export interface YukiConnectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: (payload: AccountingBatchPayload) => void
  onManualOverride?: () => void
}

export function YukiConnectModal({
  open,
  onOpenChange,
  onImported,
  onManualOverride,
}: YukiConnectModalProps) {
  const [apiKey, setApiKey] = useState('')
  const [administrationId, setAdministrationId] = useState('')
  const [historyRange, setHistoryRange] = useState<'3' | '5'>('5')
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setError(null)
      setProgress(0)
      setIsLoading(false)
    }
  }, [open])

  useEffect(() => {
    if (!isLoading) return
    const id = window.setInterval(() => {
      setProgress((current) => (current >= 90 ? current : current + 8))
    }, 300)
    return () => window.clearInterval(id)
  }, [isLoading])

  const rangeYears = useMemo(() => Number(historyRange), [historyRange])

  const handleConnect = async () => {
    setError(null)
    setIsLoading(true)
    setProgress(12)
    try {
      await accountingAPI.connectYuki(apiKey.trim(), administrationId.trim() || undefined)

      const currentYear = new Date().getFullYear()
      const startYear = currentYear - (rangeYears - 1)
      const endYear = currentYear
      setProgress(45)

      const batch = await accountingAPI.getProviderFinancialDataBatch('yuki', startYear, endYear)
      setProgress(100)
      onImported(batch)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to Yuki')
      setProgress(0)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="lg" variant="glass" closeDisabled={isLoading}>
        <ModalHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
              <KeyRound className="h-5 w-5 text-primary" />
            </div>
            <div>
              <ModalTitle>Connect Yuki</ModalTitle>
              <ModalDescription>
                Enter the Yuki `WebserviceAccessKey` and optionally the `AdministrationID` to pull the last
                3-5 fiscal years into Venus.
              </ModalDescription>
            </div>
          </div>
        </ModalHeader>

        <div className="space-y-4">
          <Input
            label="WebserviceAccessKey"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your Yuki access key"
            disabled={isLoading}
          />
          <Input
            label="AdministrationID (optional)"
            value={administrationId}
            onChange={(e) => setAdministrationId(e.target.value)}
            placeholder="Specific administration to connect"
            disabled={isLoading}
          />
          <AuroraSelect
            label="History range"
            options={[
              { value: '3', label: 'Last 3 years' },
              { value: '5', label: 'Last 5 years' },
            ]}
            value={historyRange}
            onChange={(value) => setHistoryRange((value === '3' ? '3' : '5') as '3' | '5')}
            disabled={isLoading}
          />

          <div className="rounded-2xl border border-foreground/10 bg-background/60 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-foreground/80">Import progress</span>
              <span className="text-foreground/50">{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-3 flex items-start gap-3 text-xs text-foreground/60">
              {isLoading ? (
                <>
                  <Loader2 className="mt-0.5 h-3.5 w-3.5 animate-spin text-primary" />
                  <span>Authenticating with Yuki and fetching multi-year trial balances…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-success" />
                  <span>Mercury/Titan will reuse one Yuki session and minimize SOAP calls for the selected range.</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-foreground/10 bg-background/40 p-4 text-sm text-foreground/65">
            <div className="flex items-center gap-2 font-medium text-foreground/80">
              <Building2 className="h-4 w-4" />
              Data pulled automatically
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Revenue, EBITDA, depreciation, cash, and debt</li>
              <li>MAR-based SDE normalization prompts from imported ledger lines</li>
              <li>DCF CapEx default from historical MAR 63 depreciation</li>
            </ul>
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/[0.06] px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <ModalFooter className="gap-3">
          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              onOpenChange(false)
              onManualOverride?.()
            }}
            disabled={isLoading}
          >
            Continue manually
          </Button>
          <Button
            type="button"
            onClick={handleConnect}
            disabled={isLoading || apiKey.trim().length === 0}
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Connect and pull data
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default YukiConnectModal
