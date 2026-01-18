/**
 * useBootstrapPrefill Hook
 * 
 * Applies bootstrap prefill data to form stores.
 * 
 * WORLD CLASS: Uses useLayoutEffect for synchronous application before paint,
 * preventing visual "jumps" where fields appear empty then fill in.
 * 
 * @module hooks/useBootstrapPrefill
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { useBootstrapSafe } from '../lib/bootstrap';
import type { PrefillData, CompanyInfo, PartialFinancials, BusinessTypeInfo } from '../lib/bootstrap/types';
import { useManualFormStore } from '../store/manual/useManualFormStore';
import { createContextLogger } from '../utils/logger';

const logger = createContextLogger('BootstrapPrefill');

// Track if prefill has been applied globally (survives re-renders/re-mounts)
let globalPrefillApplied = false;
let globalPrefillReportId: string | null = null;

/**
 * Apply bootstrap prefill data to form stores
 * 
 * WORLD CLASS: This hook uses useLayoutEffect to apply prefill BEFORE the browser
 * paints, ensuring the form renders with data already populated (no visual jump).
 * 
 * It applies prefilled data once after bootstrap completes.
 */
export function useBootstrapPrefill(): {
  hasPrefilled: boolean;
  prefillConfidence: number;
} {
  const bootstrap = useBootstrapSafe();
  const hasPrefilledRef = useRef(false);
  const [hasPrefilled, setHasPrefilled] = useState(false);
  
  // Get form store actions - access via getState to avoid re-renders
  const formStore = useManualFormStore;
  
  // WORLD CLASS: Use useLayoutEffect for synchronous execution before paint
  // This ensures the form fields are populated BEFORE the user sees them
  useLayoutEffect(() => {
    // Skip if no bootstrap context
    if (!bootstrap) {
      return;
    }
    
    // Skip if still bootstrapping
    if (bootstrap.isBootstrapping) {
      return;
    }
    
    // Get current report ID to track which report we've prefilled
    const currentReportId = bootstrap.report.reportId;
    
    // Skip if already prefilled for THIS report (prevents re-prefill on re-mount)
    if (globalPrefillApplied && globalPrefillReportId === currentReportId) {
      hasPrefilledRef.current = true;
      setHasPrefilled(true);
      return;
    }
    
    // Skip if no meaningful prefill data
    if (!bootstrap.hasPrefilledData || bootstrap.prefillData.confidence < 0.05) {
      logger.debug('No meaningful prefill data from bootstrap', {
        hasPrefilledData: bootstrap.hasPrefilledData,
        confidence: bootstrap.prefillData.confidence,
      });
      globalPrefillApplied = true;
      globalPrefillReportId = currentReportId;
      hasPrefilledRef.current = true;
      setHasPrefilled(true);
      return;
    }
    
    const { prefillData } = bootstrap;
    
    // Get form store actions directly to avoid stale closures
    const { updateFormData, prefillFromBusinessCard } = formStore.getState();
    
    // Apply prefill data to form SYNCHRONOUSLY
    applyPrefillToForm(prefillData, updateFormData, prefillFromBusinessCard);
    
    // Mark as prefilled globally and locally
    globalPrefillApplied = true;
    globalPrefillReportId = currentReportId;
    hasPrefilledRef.current = true;
    setHasPrefilled(true);
    
    logger.info('Applied bootstrap prefill to form (synchronous)', {
      sources: prefillData.sources,
      confidence: prefillData.confidence.toFixed(2),
      fieldsPopulated: prefillData.fieldsPopulated.length,
      fieldsRemaining: prefillData.fieldsRemaining.length,
      hasKboData: !!prefillData.kboData,
      companyName: prefillData.companyInfo?.companyName?.substring(0, 20),
    });
  }, [bootstrap, formStore]);
  
  return {
    hasPrefilled: hasPrefilled || hasPrefilledRef.current,
    prefillConfidence: bootstrap?.prefillData.confidence || 0,
  };
}

/**
 * Reset prefill state (call when navigating to a new report)
 */
export function resetBootstrapPrefillState(): void {
  globalPrefillApplied = false;
  globalPrefillReportId = null;
  logger.debug('Bootstrap prefill state reset');
}

/**
 * Apply prefill data to form stores
 * 
 * WORLD CLASS: Ensures all fields are populated including KBO data
 * so the company preview card shows immediately.
 */
function applyPrefillToForm(
  prefillData: PrefillData,
  updateFormData: (data: Partial<any>) => void,
  prefillFromBusinessCard: (card: any) => void
): void {
  const { companyInfo, financials, businessType, kboData } = prefillData;
  
  // Collect ALL data to apply in a single update for consistency
  const allData: Record<string, any> = {};
  
  // 1. Apply company info
  if (companyInfo) {
    if (companyInfo.companyName) allData.company_name = companyInfo.companyName;
    if (companyInfo.countryCode) allData.country_code = companyInfo.countryCode;
    if (companyInfo.foundingYear) allData.founding_year = companyInfo.foundingYear;
    if (companyInfo.city) allData.city = companyInfo.city;
    if (companyInfo.postalCode) allData.postal_code = companyInfo.postalCode;
    if (companyInfo.legalForm) allData.legal_form = companyInfo.legalForm;
    
    // KBO registry fields - CRITICAL for showing the company preview card
    if (companyInfo.kboNumber) allData.kbo_number = companyInfo.kboNumber;
    if (companyInfo.vatNumber) allData.vat_number = companyInfo.vatNumber;
    if (companyInfo.naceCode) allData.nace_code = companyInfo.naceCode;
    if (companyInfo.naceDescription) allData.nace_description = companyInfo.naceDescription;
  }
  
  // 2. Apply KBO data (may have additional fields not in companyInfo)
  if (kboData) {
    // Only override if not already set from companyInfo
    if (kboData.kboNumber && !allData.kbo_number) allData.kbo_number = kboData.kboNumber;
    if (kboData.vatNumber && !allData.vat_number) allData.vat_number = kboData.vatNumber;
    if (kboData.legalForm && !allData.legal_form) allData.legal_form = kboData.legalForm;
    if (kboData.city && !allData.city) allData.city = kboData.city;
    if (kboData.postalCode && !allData.postal_code) allData.postal_code = kboData.postalCode;
    if (kboData.naceCode && !allData.nace_code) allData.nace_code = kboData.naceCode;
    if (kboData.naceDescription && !allData.nace_description) allData.nace_description = kboData.naceDescription;
    if (kboData.companyName && !allData.company_name) allData.company_name = kboData.companyName;
    if (kboData.countryCode && !allData.country_code) allData.country_code = kboData.countryCode;
    
    // Store KBO verification status in business_context for the preview card
    allData.business_context = {
      kbo_registration: kboData.kboNumber,
      kbo_registration_number: kboData.kboNumber,
      legal_form: kboData.legalForm,
      company_status: kboData.status || 'Active',
      company_address: [kboData.postalCode, kboData.city].filter(Boolean).join(' '),
      kbo_verified: true, // Flag that KBO was verified
    };
  }
  
  // 3. Apply financials
  if (financials) {
    if (financials.revenue !== undefined) allData.revenue = financials.revenue;
    if (financials.ebitda !== undefined) allData.ebitda = financials.ebitda;
    if (financials.employeeCount !== undefined) allData.number_of_employees = financials.employeeCount;
    if (financials.yearData) allData.year_data = financials.yearData;
  }
  
  // 4. Apply business type
  if (businessType) {
    if (businessType.id) allData.business_type_id = businessType.id;
    if (businessType.industry) allData.industry = businessType.industry;
    if (businessType.category) allData.subIndustry = businessType.category;
  }
  
  // Apply all data in a single update
  if (Object.keys(allData).length > 0) {
    logger.debug('Applying prefill data to form', {
      fieldsCount: Object.keys(allData).length,
      fields: Object.keys(allData),
      hasKboNumber: !!allData.kbo_number,
      hasBusinessContext: !!allData.business_context,
    });
    
    updateFormData(allData);
  }
  
  // ALSO use prefillFromBusinessCard for industry/business_model mapping
  // This ensures proper mapping of business type to industry codes
  if (companyInfo?.companyName) {
    const businessCard = buildBusinessCard(companyInfo, financials, businessType);
    prefillFromBusinessCard(businessCard);
  }
}

/**
 * Build business card from company info
 */
function buildBusinessCard(
  companyInfo: CompanyInfo,
  financials?: PartialFinancials,
  businessType?: BusinessTypeInfo
): any {
  return {
    company_name: companyInfo.companyName,
    industry: businessType?.industry || 'services',
    business_model: businessType?.id || 'other',
    founding_year: companyInfo.foundingYear || new Date().getFullYear() - 5,
    country_code: companyInfo.countryCode || 'BE',
    employee_count: financials?.employeeCount,
    // KBO registry fields
    kbo_number: companyInfo.kboNumber,
    vat_number: companyInfo.vatNumber,
    city: companyInfo.city,
    postal_code: companyInfo.postalCode,
    legal_form: companyInfo.legalForm,
    nace_code: companyInfo.naceCode,
    nace_description: companyInfo.naceDescription,
  };
}

/**
 * Reset prefill state (for testing or re-initialization)
 */
export function resetPrefillState(): void {
  // This would need to be called from outside the hook
  // Typically by re-mounting the component or calling the bootstrap refresh
}

export default useBootstrapPrefill;
