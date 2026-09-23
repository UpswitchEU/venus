import { isKnownPdfRefusalCode, type PdfRefusal } from '@/hooks/pdfGenerationModel'

/**
 * The adviser-facing sentence for a refused PDF. Titan's `remediation` is English-only, so a
 * known `code` is shown from the locale files (`toast.pdfRefusal.<CODE>`); an unknown code
 * falls back to the server's own remediation rather than a generic "try again".
 *
 * @param translate `useTranslations('toast')`
 */
export function describePdfRefusal(
  refusal: PdfRefusal,
  translate: (key: string) => string
): string {
  return isKnownPdfRefusalCode(refusal.code)
    ? translate(`pdfRefusal.${refusal.code}`)
    : refusal.remediation
}
