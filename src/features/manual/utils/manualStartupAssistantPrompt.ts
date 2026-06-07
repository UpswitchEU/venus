type ManualAssistantLocale = 'en' | 'nl' | 'fr'

export function formatManualStartupAssistantPrompt(
  prompt: string,
  locale: ManualAssistantLocale
): string {
  if (locale === 'nl') {
    return [
      'Antwoord in dit exacte format (Nederlands), met deze drie kopjes vetgedrukt:',
      '',
      '**Actiepunten:** 1–3 genummerde, concrete stappen die ik nu in de wizard kan uitvoeren.',
      '**Waarom dit telt:** één zin over de impact op de waardering of het rapport.',
      '**Wat in te vullen:** een concrete waarde of voorbeeld (bedrag, percentage, multiple, of zin).',
      '',
      `Vraag van de gebruiker: ${prompt}`,
    ].join('\n')
  }

  if (locale === 'fr') {
    return [
      'Réponds exactement dans ce format (français), avec ces trois titres en gras :',
      '',
      '**Actions :** 1 à 3 étapes numérotées et concrètes à effectuer maintenant dans l’assistant.',
      '**Pourquoi c’est important :** une phrase sur l’impact pour la valorisation ou le rapport.',
      '**Que saisir :** une valeur ou un exemple concret (montant, pourcentage, multiple ou phrase).',
      '',
      `Question de l’utilisateur : ${prompt}`,
    ].join('\n')
  }

  return [
    'Reply in this exact format, with these three section headers in bold:',
    '',
    '**Action points:** 1–3 numbered, concrete things to do in the wizard right now.',
    '**Why this matters:** one sentence on the impact on the valuation or report.',
    '**What to enter:** a concrete value or example (amount, percentage, multiple, or sentence).',
    '',
    `User question: ${prompt}`,
  ].join('\n')
}
