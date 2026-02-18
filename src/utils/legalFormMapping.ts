/**
 * Maps KBO legal_form (short codes or full descriptions) to businessStructure dropdown values.
 * Used by ManualInputPanel and ManualLayout for consistent prefill from KBO/session data.
 *
 * Dropdown options: bv, nv, vof, cvba, vzw, eenmanszaak
 */
export function mapLegalFormToBusinessStructure(legalForm: string | undefined): string {
  if (!legalForm || typeof legalForm !== 'string') return '';
  const lower = legalForm.toLowerCase().trim();

  // Short codes first
  if (['bv', 'bvba'].includes(lower)) return 'bv';
  if (lower === 'nv') return 'nv';
  if (lower === 'vof') return 'vof';
  if (lower === 'cvba' || lower === 'cv') return 'cvba';
  if (lower === 'vzw') return 'vzw';
  if (lower === 'eenmanszaak') return 'eenmanszaak';

  // Long descriptions (KBO full labels)
  if (lower.includes('coöperatieve') || lower.includes('cooperatieve')) return 'cvba';
  if (lower.includes('besloten') && lower.includes('vennootschap')) return 'bv';
  if (lower.includes('naamloze') && lower.includes('vennootschap')) return 'nv';
  if (lower.includes('vennootschap onder firma') || lower.includes('v.o.f.')) return 'vof';
  if (lower.includes('vereniging zonder winstoogmerk')) return 'vzw';
  if (lower.includes('eenmanszaak')) return 'eenmanszaak';

  return '';
}
