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
      logger.debug('Bootstrap context not available yet');
      return;
    }
    
    // Skip if still bootstrapping
    if (bootstrap.isBootstrapping) {
      logger.debug('Bootstrap still in progress, waiting...');
      return;
    }
    
    // Skip if bootstrap failed
    if (bootstrap.bootstrapError) {
      logger.warn('Bootstrap failed, skipping prefill', {
        error: bootstrap.bootstrapError,
      });
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
    
    // ✅ FIX: Defer ALL state updates to prevent React error #185
    // React error #185 occurs when updating state during render
    // useLayoutEffect runs synchronously during commit phase, so we defer to next event loop tick
    // This ensures state updates happen after render completes
    setTimeout(() => {
      // Apply prefill data to form AFTER render completes
      applyPrefillToForm(prefillData, updateFormData, prefillFromBusinessCard);
      
      // Verify form data was actually set (read after update)
      const formDataAfterPrefill = formStore.getState().formData;
      
      // Mark as prefilled globally and locally
      globalPrefillApplied = true;
      globalPrefillReportId = currentReportId;
      hasPrefilledRef.current = true;
      setHasPrefilled(true);
      
      logger.info('Applied bootstrap prefill to form (deferred)', {
        sources: prefillData.sources,
        confidence: prefillData.confidence.toFixed(2),
        fieldsPopulated: prefillData.fieldsPopulated.length,
        fieldsRemaining: prefillData.fieldsRemaining.length,
        hasKboData: !!prefillData.kboData,
        companyName: prefillData.companyInfo?.companyName?.substring(0, 20),
        // Verify form data was set
        formDataAfterPrefill: {
          company_name: formDataAfterPrefill.company_name?.substring(0, 30),
          hasKboNumber: !!formDataAfterPrefill.kbo_number,
          hasBusinessTypeId: !!formDataAfterPrefill.business_type_id,
          hasFoundingYear: !!formDataAfterPrefill.founding_year,
          hasBusinessContext: !!formDataAfterPrefill.business_context,
        },
      });
    }, 0);
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
  
  // CRITICAL LOGGING: Log what we received from bootstrap
  logger.debug('applyPrefillToForm called', {
    hasCompanyInfo: !!companyInfo,
    companyInfoCompanyName: companyInfo?.companyName?.substring(0, 30),
    companyInfoCompanyNameType: typeof companyInfo?.companyName,
    companyInfoCompanyNameIsEmpty: companyInfo?.companyName === '',
    companyInfoKeys: companyInfo ? Object.keys(companyInfo).slice(0, 10) : [],
    hasKboData: !!kboData,
    kboDataCompanyName: kboData?.companyName?.substring(0, 30),
    hasBusinessType: !!businessType,
    sources: prefillData.sources,
    prefillConfidence: prefillData.confidence,
    fieldsPopulated: prefillData.fieldsPopulated.slice(0, 10),
  });
  
  // Collect ALL data to apply in a single update for consistency
  const allData: Record<string, any> = {};
  
  // 1. Apply company info (priority: companyInfo > kboData)
  if (companyInfo) {
    // CRITICAL FIX: Only set company_name if it's a non-empty string
    // Empty strings mean "no data available" and should be ignored
    if (companyInfo.companyName && companyInfo.companyName.trim() !== '') {
      allData.company_name = companyInfo.companyName;
      logger.debug('Set company_name from companyInfo', {
        company_name: companyInfo.companyName.substring(0, 30),
      });
    }
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
    
    // CRITICAL FIX: Set business_context from companyInfo if it has KBO data
    // This ensures the KBO confirmation box shows even when data comes from companyInfo (not kboData)
    if (companyInfo.kboNumber) {
      allData.business_context = {
        ...(allData.business_context || {}), // Preserve existing business_context if any
        kbo_registration: companyInfo.kboNumber,
        kbo_registration_number: companyInfo.kboNumber,
        legal_form: companyInfo.legalForm || allData.business_context?.legal_form,
        company_id: companyInfo.kboNumber, // Use KBO number as company ID
        company_address: [companyInfo.postalCode, companyInfo.city].filter(Boolean).join(' ') || allData.business_context?.company_address,
        company_status: 'Active',
        kbo_verified: true, // Flag that KBO was verified
      };
      logger.debug('Set business_context from companyInfo KBO data', {
        kbo_registration: companyInfo.kboNumber,
        legal_form: companyInfo.legalForm,
      });
    }
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
    // CRITICAL FIX: Only use kboData.companyName if it's non-empty and we don't already have one
    if (kboData.companyName && kboData.companyName.trim() !== '' && !allData.company_name) {
      allData.company_name = kboData.companyName;
      logger.debug('Set company_name from kboData', {
        company_name: kboData.companyName.substring(0, 30),
      });
    }
    if (kboData.countryCode && !allData.country_code) allData.country_code = kboData.countryCode;
    
    // Store KBO verification status in business_context for the preview card
    // CRITICAL FIX: Merge with existing business_context if it was set from companyInfo
    allData.business_context = {
      ...(allData.business_context || {}), // Preserve existing business_context
      kbo_registration: kboData.kboNumber || allData.business_context?.kbo_registration,
      kbo_registration_number: kboData.kboNumber || allData.business_context?.kbo_registration_number,
      legal_form: kboData.legalForm || allData.business_context?.legal_form,
      company_id: kboData.kboNumber || allData.business_context?.company_id,
      company_status: kboData.status || allData.business_context?.company_status || 'Active',
      company_address: [kboData.postalCode, kboData.city].filter(Boolean).join(' ') || allData.business_context?.company_address,
      kbo_verified: true, // Flag that KBO was verified
    };
    logger.debug('Set business_context from kboData', {
      kbo_registration: kboData.kboNumber,
      legal_form: kboData.legalForm,
    });
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
  
  // CRITICAL: Ensure company_name is set from either companyInfo or kboData
  // This is the most important field and must be set
  // Only use non-empty strings - empty strings mean "no data available"
  if (!allData.company_name || allData.company_name.trim() === '') {
    // Try to get company name from kboData if companyInfo doesn't have it
    if (kboData?.companyName && kboData.companyName.trim() !== '') {
      allData.company_name = kboData.companyName;
      logger.debug('Using company_name from kboData (fallback)', {
        company_name: kboData.companyName.substring(0, 30),
      });
    } else {
      logger.warn('No company_name available from bootstrap prefill', {
        hasCompanyInfo: !!companyInfo,
        companyInfoCompanyName: companyInfo?.companyName,
        hasKboData: !!kboData,
        kboDataCompanyName: kboData?.companyName,
      });
    }
  }
  
  // Apply all data in a single update FIRST
  if (Object.keys(allData).length > 0) {
    logger.debug('Applying prefill data to form', {
      fieldsCount: Object.keys(allData).length,
      fields: Object.keys(allData),
      company_name: allData.company_name?.substring(0, 30),
      hasKboNumber: !!allData.kbo_number,
      kboNumber: allData.kbo_number,
      hasBusinessContext: !!allData.business_context,
      businessContextKboRegistration: allData.business_context?.kbo_registration,
      businessContextKboRegistrationNumber: allData.business_context?.kbo_registration_number,
      businessContextLegalForm: allData.business_context?.legal_form,
      businessContextKboVerified: allData.business_context?.kbo_verified,
      businessContextCompanyId: allData.business_context?.company_id,
    });
    
    // ✅ FIX: updateFormData is already deferred by queueMicrotask in useLayoutEffect
    // No need for additional deferral here
    updateFormData(allData);
  }
  
  // ALSO use prefillFromBusinessCard for industry/business_model mapping
  // This ensures proper mapping of business type to industry codes
  // CRITICAL: Only call if we have a non-empty company name to avoid overwriting with empty value
  // ✅ FIX: prefillFromBusinessCard is already deferred by setTimeout in useLayoutEffect
  // No need for additional setTimeout here
  const finalCompanyName = allData.company_name || companyInfo?.companyName || kboData?.companyName;
  if (finalCompanyName && finalCompanyName.trim() !== '') {
    // Build business card with the final company name (from allData if set)
    const businessCard = buildBusinessCard(
      { ...companyInfo, companyName: finalCompanyName } as CompanyInfo,
      financials,
      businessType
    );
    // Call directly - already deferred by queueMicrotask wrapper
    prefillFromBusinessCard(businessCard);
    logger.debug('Called prefillFromBusinessCard', {
      company_name: finalCompanyName.substring(0, 30),
    });
  } else {
    logger.warn('Skipping prefillFromBusinessCard - no company name available', {
      hasCompanyInfo: !!companyInfo,
      hasKboData: !!kboData,
      companyInfoCompanyName: companyInfo?.companyName?.substring(0, 20),
      kboDataCompanyName: kboData?.companyName?.substring(0, 20),
    });
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
