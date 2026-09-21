import { useLocale } from 'next-intl'

const COPY = {
  en: 'This preview shows the saved valuation. Your financial inputs have changed. Use Update value to calculate a new version before sharing the current figures.',
  nl: 'Dit voorbeeld toont de opgeslagen waardering. Je financiële invoer is gewijzigd. Gebruik Waarde bijwerken om een nieuwe versie te berekenen voordat je de huidige cijfers deelt.',
  fr: 'Cet aperçu présente la valorisation enregistrée. Vos données financières ont changé. Utilisez Mettre à jour la valeur pour calculer une nouvelle version avant de partager les chiffres actuels.',
}

export function ManualSavedInputNotice({ changed }: { changed: boolean }) {
  const locale = useLocale()
  if (!changed) return null
  return (
    <p
      role="status"
      className="shrink-0 border-b border-warning/20 bg-warning/10 px-4 py-3 text-sm text-foreground"
    >
      {COPY[locale as keyof typeof COPY] ?? COPY.en}
    </p>
  )
}
