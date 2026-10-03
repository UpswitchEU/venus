'use client'

import { useTranslations } from 'next-intl'
import { createContext, type ReactNode, useContext } from 'react'
import { formatMethodAmount } from '@/utils/methodComparisonFinancials'

const ValuationMoneyContext = createContext<{ currency: string | null; locale: string }>({
  currency: null,
  locale: 'en',
})

export function ValuationMoneyProvider({
  currency,
  locale,
  children,
}: {
  currency: string | null
  locale: string
  children: ReactNode
}) {
  return (
    <ValuationMoneyContext.Provider value={{ currency, locale }}>
      {children}
    </ValuationMoneyContext.Provider>
  )
}

export function useValuationMoneyFormatter() {
  const { currency, locale } = useContext(ValuationMoneyContext)
  const t = useTranslations('omniCalc')
  return (amount: number) =>
    `${formatMethodAmount(amount, currency, locale)}${currency === null ? ` (${t('currencyUnknown')})` : ''}`
}
