export interface ParsedValue {
  field: string
  label: string
  value: number
  originalText: string
}

export interface ParsedCommand {
  type: 'normalize' | 'set' | 'add'
  field: string
  label: string
  value: number
  originalText: string
}

/**
 * Parse normalization commands from user input.
 * Supports: "Normaliseer eigenaarssalaris naar €60k", "Set EBITDA to 500k", etc.
 */
export function parseNormalizationCommands(text: string): ParsedCommand[] {
  const commands: ParsedCommand[] = []

  const normalizePatterns = [
    /normalis(?:eer|atie)?\s+([a-zà-ÿ\s]+?)\s+(?:naar|op|tot)\s+[€]?\s*([\d.,]+)\s*(k|m|miljoen|duizend)?/gi,
    /zet\s+([a-zà-ÿ\s]+?)\s+(?:naar|op)\s+[€]?\s*([\d.,]+)\s*(k|m)?/gi,
    /pas\s+([a-zà-ÿ\s]+?)\s+aan\s+(?:naar|op)\s+[€]?\s*([\d.,]+)\s*(k|m)?/gi,
    /voeg\s+[€]?\s*([\d.,]+)\s*(k|m)?\s+toe\s+(?:aan|bij)\s+([a-zà-ÿ\s]+)/gi,
  ]

  const englishPatterns = [
    /normalize\s+([a-z\s]+?)\s+to\s+[€$]?\s*([\d.,]+)\s*(k|m)?/gi,
    /set\s+([a-z\s]+?)\s+to\s+[€$]?\s*([\d.,]+)\s*(k|m)?/gi,
  ]

  const fieldMappings: Record<string, { field: string; label: string }> = {
    eigenaarssalaris: { field: 'ownerSalary', label: 'Eigenaarssalaris' },
    eigenaarsalaris: { field: 'ownerSalary', label: 'Eigenaarssalaris' },
    salaris: { field: 'ownerSalary', label: 'Eigenaarssalaris' },
    loon: { field: 'ownerSalary', label: 'Eigenaarssalaris' },
    'owner salary': { field: 'ownerSalary', label: 'Eigenaarssalaris' },
    huur: { field: 'rent', label: 'Huurkosten' },
    huurkosten: { field: 'rent', label: 'Huurkosten' },
    huisvestingskosten: { field: 'rent', label: 'Huurkosten' },
    rent: { field: 'rent', label: 'Huurkosten' },
    auto: { field: 'vehicle', label: 'Autokosten' },
    autokosten: { field: 'vehicle', label: 'Autokosten' },
    voertuig: { field: 'vehicle', label: 'Autokosten' },
    voertuigkosten: { field: 'vehicle', label: 'Autokosten' },
    car: { field: 'vehicle', label: 'Autokosten' },
    ebitda: { field: 'ebitda', label: 'EBITDA' },
    winst: { field: 'ebitda', label: 'EBITDA' },
    eenmalige: { field: 'oneTime', label: 'Eenmalige kosten' },
    'eenmalige kosten': { field: 'oneTime', label: 'Eenmalige kosten' },
    'juridische kosten': { field: 'oneTime', label: 'Eenmalige kosten' },
    privé: { field: 'personal', label: 'Privékosten' },
    privékosten: { field: 'personal', label: 'Privékosten' },
    familie: { field: 'personal', label: 'Privékosten' },
    familieleden: { field: 'personal', label: 'Privékosten' },
  }

  const parseValue = (numStr: string, suffix?: string): number => {
    let value = parseFloat(numStr.replace(/\./g, '').replace(',', '.'))
    if (suffix) {
      const s = suffix.toLowerCase()
      if (s === 'k' || s === 'duizend') value *= 1000
      else if (s === 'm' || s === 'miljoen') value *= 1000000
    }
    return value
  }

  const findField = (fieldText: string): { field: string; label: string } | null => {
    const normalized = fieldText.trim().toLowerCase()
    for (const [key, mapping] of Object.entries(fieldMappings)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return mapping
      }
    }
    return null
  }

  ;[...normalizePatterns, ...englishPatterns].forEach((pattern) => {
    let match
    const regex = new RegExp(pattern.source, pattern.flags)
    while ((match = regex.exec(text)) !== null) {
      let fieldText: string
      let numStr: string
      let suffix: string | undefined

      if (match[1].match(/[\d.,]/)) {
        numStr = match[1]
        suffix = match[2]
        fieldText = match[3]
      } else {
        fieldText = match[1]
        numStr = match[2]
        suffix = match[3]
      }

      const fieldMapping = findField(fieldText)
      if (fieldMapping) {
        const value = parseValue(numStr, suffix)
        if (!commands.find((c) => c.field === fieldMapping.field && c.value === value)) {
          commands.push({
            type: 'normalize',
            field: fieldMapping.field,
            label: fieldMapping.label,
            value,
            originalText: match[0],
          })
        }
      }
    }
  })

  return commands
}

/**
 * Parse financial values from user input text.
 * Supports formats: 500k, 500K, €500.000, 500000, 2.5M, 2,5M.
 */
export function parseFinancialValues(text: string): ParsedValue[] {
  const results: ParsedValue[] = []
  const lowerText = text.toLowerCase()

  const numberPatterns = [
    /(\d+(?:[.,]\d+)?)\s*k\b/gi,
    /(\d+(?:[.,]\d+)?)\s*m\b/gi,
    /€\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/g,
    /\b(\d{4,})\b/g,
  ]

  const fieldPatterns: { pattern: RegExp; field: string; label: string; code?: string }[] = [
    { pattern: /ebitda|winst/i, field: 'ebitda', label: 'EBITDA' },
    { pattern: /omzet|revenue/i, field: 'revenue', label: 'Omzet' },
    {
      pattern: /salaris|loon|eigenaar/i,
      field: 'ownerSalary',
      label: 'Eigenaarssalaris',
      code: '620',
    },
    { pattern: /huur|rent|kantoor|pand/i, field: 'rent', label: 'Huurkosten', code: '610' },
    { pattern: /auto|voertuig|car|wagen/i, field: 'vehicle', label: 'Autokosten', code: '614' },
    { pattern: /juridisch|legal/i, field: 'oneTime', label: 'Juridische kosten', code: '647' },
    {
      pattern: /advies|advieskosten|vergoeding/i,
      field: 'oneTime',
      label: 'Advieskosten',
      code: '613',
    },
    { pattern: /eenmalig/i, field: 'oneTime', label: 'Eenmalige kosten', code: '644' },
    { pattern: /privé|familie|persoon/i, field: 'personal', label: 'Privékosten', code: '649' },
  ]

  for (const pattern of numberPatterns) {
    let match
    const regex = new RegExp(pattern.source, pattern.flags)

    while ((match = regex.exec(text)) !== null) {
      let rawNumber = match[1] || match[0]

      rawNumber = rawNumber.replace(/€\s*/g, '').replace(/\./g, '').replace(/,/g, '.')
      let value = parseFloat(rawNumber)

      const originalMatch = match[0]
      if (originalMatch.toLowerCase().includes('k')) {
        value *= 1000
      } else if (originalMatch.toLowerCase().includes('m')) {
        value *= 1000000
      }

      for (const fp of fieldPatterns) {
        if (fp.pattern.test(lowerText)) {
          if (!results.find((r) => r.field === fp.field && r.value === value)) {
            results.push({
              field: fp.field,
              label: fp.label,
              value,
              originalText: originalMatch,
            })
          }
          break
        }
      }

      if (results.length === 0 && value >= 10000) {
        results.push({
          field: 'ebitda',
          label: 'EBITDA',
          value,
          originalText: originalMatch,
        })
      }
    }
  }

  return results
}
