'use client'

/**
 * ErrorFallback — Venus Aurora design system error UI
 *
 * Graceful, inline-ready error display for error boundaries.
 * Uses GlassCard, AuroraButton, and subtle motion.
 * Supports fullPage, inline, and modal variants (Clarity-aligned).
 */

import { motion } from 'framer-motion'
import { AlertCircle, Home, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import {
  AuroraButton,
  GlassCard,
  Modal,
  ModalContent,
  ModalDescription,
  ModalTitle,
  springGentle,
} from '@/design-system'
import { safeVenusInternalPath } from '@/utils/safeVenusRedirect'

export interface ErrorFallbackProps {
  error: Error & { digest?: string }
  reset: () => void
  homeHref?: string
  title?: string
  message?: string
  variant?: 'fullPage' | 'inline' | 'modal'
  showDetailsInDev?: boolean
}

export function ErrorFallback({
  error,
  reset,
  homeHref = '/',
  title,
  message,
  variant = 'fullPage',
  showDetailsInDev = true,
}: ErrorFallbackProps) {
  const t = useTranslations('errors.boundary')
  const displayTitle = title ?? t('somethingWentWrong')
  const displayMessage = message ?? t('genericDesc')

  useEffect(() => {
    const isMaxUpdateDepth = error.message.toLowerCase().includes('maximum update depth')
    console.error('[ErrorFallback]', {
      name: error.name,
      message: error.message,
      isMaxUpdateDepth,
      digest: error.digest,
      path: typeof window !== 'undefined' ? window.location.pathname : undefined,
      stack: error.stack,
    })
  }, [error])

  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV
  const showDiagnosticEnv =
    process.env.NODE_ENV === 'development' || vercelEnv === 'preview' || vercelEnv === 'staging'
  const showDetails = showDetailsInDev && showDiagnosticEnv

  const isCompact = variant === 'modal' || variant === 'inline'
  const iconSize = isCompact ? 'w-10 h-10' : 'w-12 h-12'
  const iconInnerSize = isCompact ? 'w-5 h-5' : 'w-6 h-6'
  const titleClass = isCompact ? 'text-base font-semibold' : 'text-xl font-semibold'

  const innerContent = (
    <>
      <div
        className={`${iconSize} mx-auto mb-4 flex items-center justify-center rounded-full bg-destructive/10`}
      >
        <AlertCircle className={`${iconInnerSize} text-destructive/70`} aria-hidden />
      </div>

      <h2 className={`${titleClass} text-foreground mb-2`}>{displayTitle}</h2>
      <p className="text-sm text-muted-foreground mb-6">{displayMessage}</p>

      {showDetails && (
        <div className="mb-6 p-4 rounded-lg bg-muted/50 border border-foreground/[0.06] text-left">
          <p className="text-xs font-medium text-foreground/80 mb-1">{t('errorDetails')}</p>
          <p className="text-xs font-mono text-muted-foreground break-all mb-1">{error.message}</p>
          {error.digest && (
            <p className="text-xs text-muted-foreground/80">Digest: {error.digest}</p>
          )}
          {error.stack && (
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground/70 cursor-pointer">
                {t('stackTrace')}
              </summary>
              <pre className="text-[10px] text-muted-foreground/60 mt-2 overflow-auto max-h-32">
                {error.stack}
              </pre>
            </details>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <AuroraButton
          onClick={reset}
          variant="primary"
          size="lg"
          className="flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          {t('tryAgain')}
        </AuroraButton>
        <AuroraButton
          onClick={() => {
            const trimmedHomeHref = homeHref.trim()
            window.location.assign(safeVenusInternalPath(trimmedHomeHref) ?? '/')
          }}
          variant="ghost"
          size="lg"
          className="flex items-center justify-center gap-2"
        >
          <Home className="w-4 h-4" />
          {t('returnToHomepage')}
        </AuroraButton>
      </div>
    </>
  )

  if (variant === 'modal') {
    return (
      <Modal open={true} onOpenChange={(open) => !open && reset()}>
        <ModalContent size="md" showClose={true}>
          <ModalTitle className="sr-only">{displayTitle}</ModalTitle>
          <ModalDescription id="error-fallback-description" className="sr-only">
            {displayMessage}
          </ModalDescription>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springGentle}
            className="text-center"
          >
            {innerContent}
          </motion.div>
        </ModalContent>
      </Modal>
    )
  }

  const content = (
    <GlassCard variant="default" glow="none" hover={false} className="max-w-md w-full text-center">
      {innerContent}
    </GlassCard>
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springGentle}
      className={
        variant === 'fullPage'
          ? 'min-h-screen flex items-center justify-center bg-background px-4'
          : 'flex items-center justify-center p-4'
      }
    >
      {content}
    </motion.div>
  )
}

export default ErrorFallback
