/**
 * useBootstrapPrefill Hook
 * 
 * Applies bootstrap prefill data to form stores.
 * Called once after bootstrap completes to populate forms.
 * 
 * @module hooks/useBootstrapPrefill
 */

import { useEffect, useRef } from 'react';
import { useBootstrapSafe } from '../lib/bootstrap';
import type { PrefillData, CompanyInfo, PartialFinancials, BusinessTypeInfo } from '../lib/bootstrap/types';
import { useManualFormStore } from '../store/manual/useManualFormStore';
import { createContextLogger } from '../utils/logger';

const logger = createContextLogger('BootstrapPrefill');

/**
 * Apply bootstrap prefill data to form stores
 * 
 * This hook bridges the bootstrap system with the existing form stores.
 * It applies prefilled data once after bootstrap completes.
 */
export function useBootstrapPrefill(): {
  hasPrefilled: boolean;
  prefillConfidence: number;
} {
  const bootstrap = useBootstrapSafe();
  const hasPrefilledRef = useRef(false);
  
  // Get form store actions
  const { updateFormData, prefillFromBusinessCard } = useManualFormStore();
  
  useEffect(() => {
    // Skip if no bootstrap context or already prefilled
    if (!bootstrap || hasPrefilledRef.current) {
      return;
    }
    
    // Skip if still bootstrapping
    if (bootstrap.isBootstrapping) {
      return;
    }
    
    // Skip if no prefill data
    if (!bootstrap.hasPrefilledData) {
      hasPrefilledRef.current = true;
      logger.debug('No prefill data available from bootstrap');
      return;
    }
    
    const { prefillData } = bootstrap;
    
    // Apply prefill data to form
    applyPrefillToForm(prefillData, updateFormData, prefillFromBusinessCard);
    
    hasPrefilledRef.current = true;
    
    logger.info('Applied bootstrap prefill to form', {
      sources: prefillData.sources,
      confidence: prefillData.confidence.toFixed(2),
      fieldsPopulated: prefillData.fieldsPopulated.length,
      fieldsRemaining: prefillData.fieldsRemaining.length,
    });
  }, [bootstrap, updateFormData, prefillFromBusinessCard]);
  
  return {
    hasPrefilled: hasPrefilledRef.current,
    prefillConfidence: bootstrap?.prefillData.confidence || 0,
  };
}

/**
 * Apply prefill data to form stores
 */
function applyPrefillToForm(
  prefillData: PrefillData,
  updateFormData: (data: Partial<any>) => void,
  prefillFromBusinessCard: (card: any) => void
): void {
  const { companyInfo, financials, businessType, kboData } = prefillData;
  
  // If we have a business card-like structure, use the optimized path
  if (companyInfo?.companyName) {
    const businessCard = buildBusinessCard(companyInfo, financials, businessType);
    prefillFromBusinessCard(businessCard);
  }
  
  // Apply additional fields that might not be covered by business card
  const additionalData: Record<string, any> = {};
  
  // Apply financials
  if (financials) {
    if (financials.revenue !== undefined) {
      additionalData.revenue = financials.revenue;
    }
    if (financials.ebitda !== undefined) {
      additionalData.ebitda = financials.ebitda;
    }
    if (financials.employeeCount !== undefined) {
      additionalData.number_of_employees = financials.employeeCount;
    }
    if (financials.yearData) {
      additionalData.year_data = financials.yearData;
    }
  }
  
  // Apply KBO-specific data
  if (kboData) {
    if (kboData.naceCode && !additionalData.nace_code) {
      additionalData.nace_code = kboData.naceCode;
    }
    if (kboData.naceDescription && !additionalData.nace_description) {
      additionalData.nace_description = kboData.naceDescription;
    }
  }
  
  // Apply business type
  if (businessType) {
    if (businessType.id) {
      additionalData.business_type_id = businessType.id;
    }
    if (businessType.industry) {
      additionalData.industry = businessType.industry;
    }
    if (businessType.category) {
      additionalData.subIndustry = businessType.category;
    }
  }
  
  // Apply additional data if any
  if (Object.keys(additionalData).length > 0) {
    updateFormData(additionalData);
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
