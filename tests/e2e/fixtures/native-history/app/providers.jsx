'use client'
import { NextIntlClientProvider } from 'next-intl'
import { Toaster } from 'sonner'
import { installWorkspaceHistory } from '@venus/utils/workspaceHistory'
if (typeof window !== 'undefined') installWorkspaceHistory()
import messages from '@venus-messages'
export default function Providers({ children }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <style>{`body{font:16px system-ui;margin:32px;max-width:700px}button,input{font:inherit;padding:12px;margin:8px}label{display:block}a{display:inline-block;margin:12px}`}</style>
      {children}
      <Toaster />
    </NextIntlClientProvider>
  )
}
