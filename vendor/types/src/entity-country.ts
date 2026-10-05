/** Country identity metadata v1 (2026-10-05).
 * Mirrors: Venus vendor/types, Titan _vendor/entity-country, Mercury shared/lib.
 * Sources: https://www.gleif.org/about-lei/code-lists/iso-20275-entity-legal-forms-code-list
 * https://entreprendre.service-public.gouv.fr/vosdroits/F23844
 * https://www.kvk.nl/onderwerp/rechtsvormen/
 * Common forms only; other/unknown preserve registry descriptions without guessing.
 * Codes are country-scoped UI codes, not ISO ELF identifiers or tax regimes.
 */
export const ENTITY_COUNTRY_VERSION = 'entity-country.v1'
export type LegalFormOption = { value: string; label: string; aliases?: readonly string[] }
const form = (value: string, label: string, ...aliases: string[]): LegalFormOption => ({ value, label, aliases })
export const LEGAL_FORMS_BY_COUNTRY: Readonly<Record<string, readonly LegalFormOption[]>> = {
  AT: [form('gmbh', 'GmbH'), form('ag', 'AG'), form('og', 'OG'), form('kg', 'KG'), form('einzelunternehmen', 'Einzelunternehmen')],
  BE: [form('bv', 'BV / SRL', 'BVBA', 'SPRL', 'SRL', 'Besloten Vennootschap', 'Société à responsabilité limitée'), form('nv', 'NV / SA', 'SA', 'Naamloze Vennootschap', 'Société anonyme'), form('eenmanszaak', 'Eenmanszaak / Entreprise individuelle', 'Entreprise individuelle'), form('vof', 'VOF / SNC', 'SNC', 'Vennootschap onder firma'), form('cv', 'CV / SC', 'SC', 'Coöperatieve vennootschap', 'Société coopérative'), form('cvba', 'CVBA / SCRL (legacy)', 'SCRL'), form('commv', 'CommV / SComm', 'SComm'), form('vzw', 'VZW / ASBL', 'ASBL', 'Vereniging zonder winstoogmerk')],
  CH: [form('gmbh', 'GmbH / Sàrl', 'Sàrl'), form('ag', 'AG / SA', 'SA'), form('einzelunternehmen', 'Einzelunternehmen / Entreprise individuelle'), form('klg', 'Kollektivgesellschaft'), form('genossenschaft', 'Genossenschaft / Société coopérative')],
  DE: [form('gmbh', 'GmbH', 'Gesellschaft mit beschränkter Haftung'), form('ug', 'UG (haftungsbeschränkt)', 'UG'), form('ag', 'AG'), form('gbr', 'GbR'), form('ohg', 'OHG'), form('kg', 'KG'), form('einzelunternehmen', 'Einzelunternehmen')],
  DK: [form('aps', 'ApS'), form('as', 'A/S'), form('is', 'I/S'), form('ks', 'K/S'), form('enkeltmandsvirksomhed', 'Enkeltmandsvirksomhed')],
  EE: [form('ou', 'OÜ', 'Osaühing'), form('as', 'AS', 'Aktsiaselts'), form('fie', 'FIE'), form('tu', 'TÜ'), form('uu', 'UÜ')],
  ES: [form('sl', 'SL', 'Sociedad limitada', 'Sociedad de responsabilidad limitada'), form('slu', 'SLU'), form('sa', 'SA'), form('sc', 'Sociedad colectiva'), form('cooperativa', 'Sociedad cooperativa'), form('empresario_individual', 'Empresario individual')],
  FI: [form('oy', 'Oy'), form('oyj', 'Oyj'), form('ay', 'Ay'), form('ky', 'Ky'), form('osuuskunta', 'Osuuskunta'), form('toiminimi', 'Toiminimi')],
  FR: [form('sarl', 'SARL', 'Société à responsabilité limitée', 'Société à responsabilité limitée (sans autre indication)', '5499'), form('eurl', 'EURL', 'SARL unipersonnelle', '5498'), form('sas', 'SAS', 'Société par actions simplifiée', '5710'), form('sasu', 'SASU', 'Société par actions simplifiée unipersonnelle', '5720'), form('sa', 'SA', 'Société anonyme'), form('snc', 'SNC', 'Société en nom collectif'), form('ei', 'Entreprise individuelle (EI)', 'EI', 'Entrepreneur individuel', '1000'), form('sci', 'SCI', 'Société civile immobilière'), form('association', 'Association')],
  GB: [form('ltd', 'Ltd', 'Private limited company', 'Limited'), form('plc', 'PLC', 'Public limited company'), form('llp', 'LLP', 'Limited liability partnership'), form('lp', 'Limited partnership'), form('partnership', 'Partnership'), form('sole_trader', 'Sole trader')],
  IE: [form('ltd', 'LTD'), form('dac', 'DAC'), form('plc', 'PLC'), form('clg', 'CLG'), form('partnership', 'Partnership'), form('sole_trader', 'Sole trader')],
  IT: [form('srl', 'SRL', 'Società a responsabilità limitata'), form('srls', 'SRLS'), form('spa', 'SPA', 'Società per azioni'), form('snc', 'SNC'), form('sas', 'SAS'), form('ditta_individuale', 'Ditta individuale'), form('cooperativa', 'Società cooperativa')],
  LT: [form('uab', 'UAB'), form('ab', 'AB'), form('mb', 'MB'), form('ii', 'IĮ'), form('tikroji_ukine_bendrija', 'Tikroji ūkinė bendrija')],
  LU: [form('sarl', 'SARL', 'Sàrl', 'Société à responsabilité limitée'), form('sarl_s', 'SARL-S'), form('sa', 'SA'), form('sas', 'SAS'), form('snc', 'SNC'), form('scs', 'SCS'), form('scsp', 'SCSp'), form('entreprise_individuelle', 'Entreprise individuelle')],
  NL: [form('bv', 'BV', 'Besloten vennootschap'), form('nv', 'NV', 'Naamloze vennootschap'), form('eenmanszaak', 'Eenmanszaak'), form('vof', 'VOF', 'Vennootschap onder firma'), form('cv', 'CV (Commanditaire vennootschap)', 'Commanditaire vennootschap'), form('cooperatie', 'Coöperatie', 'Cooperatie'), form('maatschap', 'Maatschap'), form('stichting', 'Stichting'), form('vereniging', 'Vereniging')],
  NO: [form('as', 'AS'), form('asa', 'ASA'), form('ans', 'ANS'), form('da', 'DA'), form('enk', 'Enkeltpersonforetak', 'ENK'), form('sa', 'Samvirkeforetak', 'SA')],
  PL: [form('sp_z_oo', 'Sp. z o.o.', 'Spółka z ograniczoną odpowiedzialnością'), form('sa', 'S.A.'), form('psa', 'P.S.A.'), form('sp_j', 'Sp.j.'), form('sp_k', 'Sp.k.'), form('jdg', 'Jednoosobowa działalność gospodarcza')],
  PT: [form('lda', 'Lda.', 'Sociedade por quotas'), form('unipessoal_lda', 'Unipessoal Lda.'), form('sa', 'S.A.'), form('eni', 'Empresário em nome individual'), form('cooperativa', 'Cooperativa')],
  SE: [form('ab', 'AB', 'Aktiebolag'), form('hb', 'HB', 'Handelsbolag'), form('kb', 'KB', 'Kommanditbolag'), form('enskild_firma', 'Enskild firma'), form('ekonomisk_forening', 'Ekonomisk förening')],
  SK: [form('sro', 's.r.o.', 'Spoločnosť s ručením obmedzeným'), form('as', 'a.s.'), form('vos', 'v.o.s.'), form('ks', 'k.s.'), form('druzstvo', 'Družstvo'), form('zivnostnik', 'Živnostník')],
}
export const COUNTRY_CURRENCIES: Readonly<Record<string, string>> = {
  AT: 'EUR', BE: 'EUR', CH: 'CHF', DE: 'EUR', DK: 'DKK', EE: 'EUR', ES: 'EUR', FI: 'EUR', FR: 'EUR', GB: 'GBP', IE: 'EUR', IT: 'EUR', LT: 'EUR', LU: 'EUR', NL: 'EUR', NO: 'NOK', PL: 'PLN', PT: 'EUR', SE: 'SEK', SK: 'EUR',
}
export function normalizeEntityCountry(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase() === 'UK' ? 'GB' : value.trim().toUpperCase()
  return Object.hasOwn(LEGAL_FORMS_BY_COUNTRY, code) ? code : null
}
const token = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
export function normalizeLegalForm(country: string | null | undefined, value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  if (value === 'other' || value === 'unknown') return value
  const wanted = token(value)
  const options = LEGAL_FORMS_BY_COUNTRY[normalizeEntityCountry(country) ?? ''] ?? []
  return options.find((option) => [option.value, option.label, ...(option.aliases ?? [])].some((alias) => token(alias) === wanted))?.value ?? null
}
export function getLegalFormOptions(country: string, locale = 'en'): LegalFormOption[] {
  const copy = locale.startsWith('fr') ? ['Autre', 'Non renseignée'] : locale.startsWith('nl') ? ['Andere', 'Onbekend'] : ['Other', 'Unknown']
  return [...(LEGAL_FORMS_BY_COUNTRY[normalizeEntityCountry(country) ?? ''] ?? []), form('other', copy[0]), form('unknown', copy[1])]
}
