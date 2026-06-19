'use client'

import { useTranslations } from 'next-intl'
import { showAdvisorCalculatorSurface } from '../constants/accountantPlanMethods'
import { trackPaywallUpgradeClick } from '../lib/analytics'
import { isAccountantBillingUpgradePath, isClientPremiumUpgradePath } from '../lib/bootstrap'
import { getMercuryUrl } from '../utils/getMercuryUrl'
import { ValuationPaywallModal } from './ValuationPaywallModal'

interface PaywallData {
  current: number
  limit: number
  message: string
}

interface BootstrapCreditStatus {
  allowed: boolean
  credits_limit: number
  credits_remaining: number
  message?: string
  upgrade_path?: string
}

interface ValuationSessionPaywallProps {
  authUserRole?: string
  bootstrapCreditStatus?: BootstrapCreditStatus | null
  bootstrapIsAccountantFlow?: boolean
  clearPaywall: () => void
  onNavigateHome: () => void
  pathname: string | null
  paywallData: PaywallData | null
  showCreditError: boolean | undefined
}

export function ValuationSessionPaywall({
  authUserRole,
  bootstrapCreditStatus,
  bootstrapIsAccountantFlow,
  clearPaywall,
  onNavigateHome,
  pathname,
  paywallData,
  showCreditError,
}: ValuationSessionPaywallProps) {
  const t = useTranslations('modals')
  const isAdvisorAudience =
    showAdvisorCalculatorSurface(!!bootstrapIsAccountantFlow, authUserRole) ||
    isAccountantBillingUpgradePath(bootstrapCreditStatus?.upgrade_path)
  const audience: 'advisor' | 'business_owner' = isAdvisorAudience ? 'advisor' : 'business_owner'

  if (showCreditError && bootstrapCreditStatus) {
    return (
      <ValuationPaywallModal
        isOpen={true}
        audience={audience}
        onClose={onNavigateHome}
        current={bootstrapCreditStatus.credits_remaining}
        limit={bootstrapCreditStatus.credits_limit}
        message={
          bootstrapCreditStatus.message ||
          (isAccountantBillingUpgradePath(bootstrapCreditStatus.upgrade_path)
            ? t('paywall.accountantPaidRequired')
            : isClientPremiumUpgradePath(bootstrapCreditStatus.upgrade_path)
              ? t('paywall.clientPremiumRequired')
              : t('paywall.insufficientCredits'))
        }
        onUpgrade={() => {
          const locale = pathname?.match(/^\/(en|nl|fr)/)?.[1] || 'en'
          trackPaywallUpgradeClick('bootstrap_credit')
          const base = getMercuryUrl()
          const upgradePath = isAccountantBillingUpgradePath(bootstrapCreditStatus.upgrade_path)
            ? `${base}/${locale}/advisor/settings?tab=billing`
            : isClientPremiumUpgradePath(bootstrapCreditStatus.upgrade_path)
              ? `${base}/${locale}/pricing?tab=sellers`
              : audience === 'business_owner'
                ? `${base}/${locale}/business/dashboard`
                : `${base}/${locale}/pricing`
          window.location.href = upgradePath
        }}
      />
    )
  }

  return (
    <ValuationPaywallModal
      isOpen={!!paywallData}
      audience={audience}
      onClose={() => {
        clearPaywall()
        onNavigateHome()
      }}
      current={paywallData?.current || 0}
      limit={paywallData?.limit || 1}
      message={paywallData?.message}
      onUpgrade={() => {
        const locale = pathname?.match(/^\/(en|nl|fr)/)?.[1] || 'en'
        trackPaywallUpgradeClick('session_credit')
        const base = getMercuryUrl()
        window.location.href =
          audience === 'business_owner'
            ? `${base}/${locale}/business/dashboard`
            : `${base}/${locale}/pricing`
      }}
    />
  )
}
