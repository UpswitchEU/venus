import { describe, expect, it } from 'vitest'
import type { BootstrapContextValue } from '../../lib/bootstrap/BootstrapContext'
import type { BusinessType } from '../../services/businessTypesApi'
import {
  hasMeaningfulBootstrapPrefill,
  isViewingExistingBootstrapReport,
  resolveBusinessCardBusinessTypeFormData,
  resolvePrefilledQueryBusinessTypeFormData,
} from './ValuationFormPrefillModel'

function makeBootstrap(overrides: Partial<BootstrapContextValue>): BootstrapContextValue {
  return {
    hasPrefilledData: false,
    report: { mode: 'new', reportId: 'val_new', hasExistingData: false },
    prefillData: {
      sources: [],
      confidence: 0,
      fieldsPopulated: [],
      fieldsRemaining: [],
    },
    ...overrides,
  } as BootstrapContextValue
}

function makeBusinessType(overrides: Partial<BusinessType>): BusinessType {
  return {
    id: 'consulting',
    title: 'Consulting',
    description: '',
    icon: '',
    category: 'services',
    category_id: 'services',
    industryMapping: 'services',
    keywords: ['consulting'],
    popular: false,
    status: 'active',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('ValuationForm prefill model', () => {
  it('treats existing bootstrap reports with data as existing report views', () => {
    expect(
      isViewingExistingBootstrapReport(
        makeBootstrap({
          report: {
            mode: 'existing',
            reportId: 'val_existing',
            hasExistingData: true,
          },
        })
      )
    ).toBe(true)
  })

  it('detects meaningful bootstrap prefill from sparse financial year data', () => {
    expect(
      hasMeaningfulBootstrapPrefill({
        bootstrap: makeBootstrap({
          prefillData: {
            sources: ['session'],
            confidence: 0.01,
            fieldsPopulated: [],
            fieldsRemaining: [],
            financials: {
              yearData: {
                '2024': { revenue: 1_000_000 },
              },
            },
          },
        }),
        prefillConfidence: 0,
      })
    ).toBe(true)
  })

  it('lets explicit business_type_id beat industry fallback for business-card prefill', () => {
    const formData = resolveBusinessCardBusinessTypeFormData({
      businessCard: {
        company_name: 'Studio BV',
        industry: 'software',
        business_model: 'services',
        founding_year: 2020,
        country_code: 'BE',
        business_type_id: 'consulting',
      },
      businessTypes: [
        makeBusinessType({
          id: 'software',
          title: 'Software',
          industryMapping: 'software',
        }),
        makeBusinessType({
          id: 'consulting',
          title: 'Consulting',
          industryMapping: 'advisory',
        }),
      ],
    })

    expect(formData?.business_type_id).toBe('consulting')
    expect(formData?.business_type_title).toBe('Consulting')
  })

  it('resolves URL prefilled query into canonical business-type form data', () => {
    const result = resolvePrefilledQueryBusinessTypeFormData({
      prefilledQuery: 'custom software platform',
      businessTypes: [
        makeBusinessType({
          id: 'software',
          title: 'Software Development',
          keywords: ['custom software'],
        }),
      ],
    })

    expect(result?.matchedType.id).toBe('software')
    expect(result?.formData.business_type_id).toBe('software')
  })
})
