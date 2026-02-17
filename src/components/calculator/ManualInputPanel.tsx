'use client';

/**
 * Manual Input Panel
 * 
 * Clean, minimal form for bedrijfsschatting data entry.
 * World-class design: progressive disclosure, single primary CTA.
 * 
 * KEY FEATURE: Multi-year EBITDA Normalization
 * - Normalizations apply to historical years (3-5 years)
 * - Calculate normalized average EBITDA for valuation
 * - Each year can have its own set of adjustments
 */

import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Check, 
  Link2, 
  ChevronDown,
  ChevronRight,
  X,
  Plus,
  Building2,
  Calculator,
  TrendingUp,
  HelpCircle,
  AlertCircle,
  FileSpreadsheet,
  Zap
} from 'lucide-react';
import { cn } from '@/design-system/utils';
import { AuroraInput } from '@/design-system/components/Input';
import { CurrencyInput } from './CurrencyInput';
import { AuroraSelect } from '@/design-system/components/Select';
import { AuroraButton } from '@/design-system/components/Button';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalFooter } from '@/design-system/components/Modal';
import { Switch } from '@/design-system/components/Switch';
import {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
} from '@/design-system/components/Tooltip';
import { 
  KBOSearchInput, 
  BusinessTypeSearchInput,
  type KBOCompany, 
  type BusinessType 
} from '@/design-system';
import { 
  UnifiedNormalizationModal,
  type NormalizationItem as UnifiedNormalizationItem,
} from './UnifiedNormalizationModal';

// Types
export interface YearlyFinancials {
  year: string;
  revenue: number;
  ebitda: number;
  normalizedEbitda?: number;
  normalizations: NormalizationItem[];
}

export interface ValuationFormData {
  companyName: string;
  kboNumber?: string;
  legalForm?: string;
  address?: string;
  naceCode?: string;
  naceDescription?: string;
  businessType: string;
  businessTypeCode?: string;
  industry: string;
  country: string;
  yearFounded: string;
  businessStructure: string;
  equityStake: number;
  ownerManagers: number;
  fteEmployees: number;
  // Multi-year financials with normalizations per year
  yearlyFinancials: YearlyFinancials[];
  // Calculated values
  averageNormalizedEbitda?: number;
}

export interface NormalizationItem {
  id: string;
  code: string;
  name: string;
  category: string;
  originalValue: number;
  adjustedValue: number;
  adjustment: number;
  reason: string;
  enabled: boolean;
}

// Field help context for AI assistant integration
export interface FieldHelpContext {
  field: string;
  label: string;
  value?: number | string;
  grootboekCode?: string;
  category?: string;
  hint?: string;
  normalizationType?: 'salary' | 'rent' | 'vehicle' | 'one-time' | 'personal' | 'other';
}

// Quick action for top normalisations
export interface QuickNormalizationAction {
  id: string;
  code: string;
  description: string;
  category: 'salary' | 'rent' | 'vehicle' | 'one-time' | 'personal' | 'depreciation' | 'other';
  amount: number;
  reason: string;
  sourceRef?: string;
  status: 'pending' | 'accepted' | 'rejected';
}

interface ManualInputPanelProps {
  onSubmit: (data: ValuationFormData) => void;
  onCSVImportComplete?: (source: 'yuki' | 'exact' | 'odoo', fileName?: string) => void;
  isCalculating?: boolean;
  initialData?: Partial<ValuationFormData>;
  // Contextual AI assistant integration
  onFieldHelpRequest?: (context: FieldHelpContext) => void;
  // Quick actions for high-impact normalizations
  quickActions?: QuickNormalizationAction[];
  onQuickActionAccept?: (id: string) => void;
  onQuickActionReject?: (id: string) => void;
  onViewAllNormalizations?: () => void;
}

// Options
const businessStructures = [
  { value: 'bv', label: 'BV' },
  { value: 'nv', label: 'NV' },
  { value: 'eenmanszaak', label: 'Eenmanszaak' },
  { value: 'vof', label: 'VOF' },
  { value: 'cvba', label: 'CVBA' },
  { value: 'vzw', label: 'VZW' },
];

// Common normalization templates by accounting code
const normalizationTemplates: Omit<NormalizationItem, 'id' | 'originalValue' | 'adjustedValue' | 'adjustment'>[] = [
  { code: '6100', name: 'Eigenaarssalaris', category: 'Personeelskosten', reason: 'Correctie naar marktconform niveau', enabled: true },
  { code: '6101', name: 'Familieleden salaris', category: 'Personeelskosten', reason: 'Correctie naar marktconform niveau', enabled: false },
  { code: '6200', name: 'Afschrijvingen', category: 'Afschrijvingen', reason: 'Correctie versnelde afschrijving', enabled: false },
  { code: '6300', name: 'Huur kantoorpand', category: 'Huisvestingskosten', reason: 'Correctie naar marktwaarde', enabled: false },
  { code: '6400', name: 'Autokosten directie', category: 'Autokosten', reason: 'Correctie privégebruik', enabled: false },
  { code: '6500', name: 'Eenmalige advieskosten', category: 'Eenmalige kosten', reason: 'Niet-recurrente kosten', enabled: false },
  { code: '6600', name: 'Rechtszaak/schikking', category: 'Eenmalige kosten', reason: 'Eenmalige juridische kosten', enabled: false },
  { code: '6700', name: 'Herstructureringskosten', category: 'Eenmalige kosten', reason: 'Niet-recurrente kosten', enabled: false },
  { code: '7400', name: 'Verkoop activa', category: 'Eenmalige baten', reason: 'Niet-recurrente opbrengst', enabled: false },
];

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Inline FieldHelpTrigger component for contextual AI assistance
function FieldHelpTrigger({
  context,
  onTrigger,
  className,
}: {
  context: FieldHelpContext;
  onTrigger?: (context: FieldHelpContext) => void;
  className?: string;
}) {
  if (!onTrigger) return null;
  
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onTrigger(context);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <TooltipRoot>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            className={cn(
              "inline-flex items-center justify-center rounded-md transition-all",
              "text-foreground/30 hover:text-primary hover:bg-primary/10",
              "focus:outline-none focus:ring-2 focus:ring-primary/20",
              "w-5 h-5",
              className
            )}
            aria-label={`Vraag AI over ${context.label}`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px] text-xs">
          <p>Vraag AI-assistent over {context.label.toLowerCase()}</p>
          {context.grootboekCode && (
            <p className="text-foreground/50 mt-0.5 font-mono text-[10px]">
              Grootboek: {context.grootboekCode}
            </p>
          )}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}

const currentYear = new Date().getFullYear();

// Generate default yearly financials for last 3 years
const generateDefaultYearlyFinancials = (): YearlyFinancials[] => {
  return [
    { year: String(currentYear - 1), revenue: 0, ebitda: 0, normalizations: [] },
    { year: String(currentYear - 2), revenue: 0, ebitda: 0, normalizations: [] },
    { year: String(currentYear - 3), revenue: 0, ebitda: 0, normalizations: [] },
  ];
};

export function ManualInputPanel({
  onSubmit,
  onCSVImportComplete,
  isCalculating = false,
  initialData = {},
  onFieldHelpRequest,
  quickActions = [],
  onQuickActionAccept,
  onQuickActionReject,
  onViewAllNormalizations,
}: ManualInputPanelProps) {
  const t = useTranslations();
  const [formData, setFormData] = useState<ValuationFormData>({
    companyName: initialData.companyName || '',
    kboNumber: initialData.kboNumber || '',
    legalForm: initialData.legalForm || '',
    address: initialData.address || '',
    naceCode: initialData.naceCode || '',
    naceDescription: initialData.naceDescription || '',
    businessType: initialData.businessType || '',
    businessTypeCode: initialData.businessTypeCode || '',
    industry: initialData.industry || '',
    country: initialData.country || 'BE',
    yearFounded: initialData.yearFounded || '',
    businessStructure: initialData.businessStructure || '',
    equityStake: initialData.equityStake || 100,
    ownerManagers: initialData.ownerManagers || 1,
    fteEmployees: initialData.fteEmployees || 5,
    yearlyFinancials: initialData.yearlyFinancials || generateDefaultYearlyFinancials(),
  });

  // KBO verification state
  const [selectedCompany, setSelectedCompany] = useState<KBOCompany | null>(null);
  const [companySearchValue, setCompanySearchValue] = useState(formData.companyName || '');

  // Business type state
  const [selectedBusinessType, setSelectedBusinessType] = useState<BusinessType | null>(null);

  // Section collapse states
  const [showNormalizationModal, setShowNormalizationModal] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectedIntegration, setConnectedIntegration] = useState<string | null>(null);
  const [activeNormalizationYear, setActiveNormalizationYear] = useState(String(currentYear - 1));
  const [hideUploadHint, setHideUploadHint] = useState(false);
  
  // Unified normalization items for the enhanced modal
  const [unifiedNormalizations, setUnifiedNormalizations] = useState<UnifiedNormalizationItem[]>([]);

  // Calculate normalized EBITDA per year and average
  const normalizedData = useMemo(() => {
    const years = formData.yearlyFinancials.map(yf => {
      const totalAdjustment = yf.normalizations
        .filter(n => n.enabled)
        .reduce((sum, n) => sum + n.adjustment, 0);
      const normalizedEbitda = yf.ebitda + totalAdjustment;
      return {
        ...yf,
        normalizedEbitda,
        totalAdjustment,
      };
    });

    // Calculate weighted average (more recent years weighted higher)
    const validYears = years.filter(y => y.ebitda > 0);
    let weightedSum = 0;
    let totalWeight = 0;
    validYears.forEach((y, index) => {
      const weight = validYears.length - index; // Most recent = highest weight
      weightedSum += y.normalizedEbitda * weight;
      totalWeight += weight;
    });

    const averageNormalizedEbitda = totalWeight > 0 ? weightedSum / totalWeight : 0;

    return {
      years,
      averageNormalizedEbitda,
      totalYearsWithData: validYears.length,
    };
  }, [formData.yearlyFinancials]);

  const updateField = <K extends keyof ValuationFormData>(
    field: K,
    value: ValuationFormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const updateYearlyFinancials = (year: string, field: 'revenue' | 'ebitda', value: number) => {
    const updated = formData.yearlyFinancials.map(yf =>
      yf.year === year ? { ...yf, [field]: value } : yf
    );
    updateField('yearlyFinancials', updated);
  };

  const updateYearNormalization = (year: string, normalizationId: string, enabled: boolean) => {
    const updated = formData.yearlyFinancials.map(yf => {
      if (yf.year !== year) return yf;
      return {
        ...yf,
        normalizations: yf.normalizations.map(n =>
          n.id === normalizationId ? { ...n, enabled } : n
        ),
      };
    });
    updateField('yearlyFinancials', updated);
  };

  const addNormalizationToYear = (year: string, template: typeof normalizationTemplates[0]) => {
    const updated = formData.yearlyFinancials.map(yf => {
      if (yf.year !== year) return yf;
      const exists = yf.normalizations.find(n => n.code === template.code);
      if (exists) return yf;
      
      return {
        ...yf,
        normalizations: [
          ...yf.normalizations,
          {
            id: `${year}-${template.code}-${Date.now()}`,
            ...template,
            originalValue: 0,
            adjustedValue: 0,
            adjustment: 0,
          },
        ],
      };
    });
    updateField('yearlyFinancials', updated);
  };

  const updateNormalizationValue = (year: string, normalizationId: string, field: 'originalValue' | 'adjustedValue', value: number) => {
    const updated = formData.yearlyFinancials.map(yf => {
      if (yf.year !== year) return yf;
      return {
        ...yf,
        normalizations: yf.normalizations.map(n => {
          if (n.id !== normalizationId) return n;
          const newN = { ...n, [field]: value };
          newN.adjustment = newN.adjustedValue - newN.originalValue;
          return newN;
        }),
      };
    });
    updateField('yearlyFinancials', updated);
  };

  // ─── Field-level Validation ───
  const fieldValidation = useMemo(() => {
    const warnings: Record<string, string> = {};
    const errors: Record<string, string> = {};
    const currentYear = new Date().getFullYear();

    // Validate yearly financials
    for (const yf of formData.yearlyFinancials) {
      if (yf.revenue > 0 && yf.revenue > 1_000_000_000) {
        warnings[`revenue-${yf.year}`] = 'Omzet > €1B — controleer dit getal';
      }
      if (yf.ebitda !== 0) {
        if (yf.ebitda < -100_000_000) errors[`ebitda-${yf.year}`] = 'EBITDA onder -€100M is onwaarschijnlijk';
        else if (yf.ebitda > 500_000_000) errors[`ebitda-${yf.year}`] = 'EBITDA boven €500M is onwaarschijnlijk';
        if (yf.revenue > 0) {
          const margin = (yf.ebitda / yf.revenue) * 100;
          if (margin < -50) warnings[`margin-${yf.year}`] = `EBITDA-marge ${margin.toFixed(0)}% — ongebruikelijk laag`;
          else if (margin > 80) warnings[`margin-${yf.year}`] = `EBITDA-marge ${margin.toFixed(0)}% — ongebruikelijk hoog`;
        }
      }
    }

    // Owner managers
    if (formData.ownerManagers < 0) errors.ownerManagers = 'Minimaal 0';
    // FTE Employees
    if (formData.fteEmployees < 0) errors.fteEmployees = 'Minimaal 0';
    else if (formData.fteEmployees > 10000) warnings.fteEmployees = 'Meer dan 10.000 FTE — controleer';
    // Equity stake
    if (formData.equityStake < 0 || formData.equityStake > 100) errors.equityStake = 'Moet tussen 0% en 100% liggen';
    // Year founded
    if (formData.yearFounded && (Number(formData.yearFounded) < 1800 || Number(formData.yearFounded) > currentYear)) {
      errors.yearFounded = `Moet tussen 1800 en ${currentYear} liggen`;
    }

    return { warnings, errors, hasErrors: Object.keys(errors).length > 0 };
  }, [formData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fieldValidation.hasErrors) {
      import('sonner').then(({ toast }) => toast.error('Controleer de invoervelden', { description: Object.values(fieldValidation.errors)[0] }));
      return;
    }
    onSubmit({
      ...formData,
      averageNormalizedEbitda: normalizedData.averageNormalizedEbitda,
    });
  };

  // Handle KBO company selection
  const handleCompanySelect = (company: KBOCompany) => {
    setSelectedCompany(company);
    setCompanySearchValue(company.name);
    
    setFormData(prev => ({
      ...prev,
      companyName: company.name,
      kboNumber: company.kboNumber,
      legalForm: company.legalForm,
      address: `${company.address}, ${company.postalCode} ${company.city}`,
      naceCode: company.naceCode || '',
      naceDescription: company.naceDescription || '',
      businessStructure: company.legalForm.toLowerCase() === 'bv' ? 'bv' 
        : company.legalForm.toLowerCase() === 'nv' ? 'nv'
        : company.legalForm.toLowerCase() === 'vof' ? 'vof'
        : company.legalForm.toLowerCase() === 'cvba' ? 'cvba'
        : '',
    }));
  };

  const handleBusinessTypeSelect = (value: string, businessType?: BusinessType) => {
    setSelectedBusinessType(businessType || null);
    updateField('businessType', value);
    if (businessType) {
      updateField('businessTypeCode', businessType.code);
      updateField('industry', businessType.category);
    }
  };

  const handleClearCompany = () => {
    setSelectedCompany(null);
    setCompanySearchValue('');
    setFormData(prev => ({
      ...prev,
      companyName: '',
      kboNumber: '',
      legalForm: '',
      address: '',
      naceCode: '',
      naceDescription: '',
      businessStructure: '',
    }));
  };

  const handleConnect = (integrationId: string) => {
    setShowConnectModal(false);
    import('sonner').then(({ toast }) => toast.info('CSV import in volgende versie', {
      description: 'Directe import vanuit CSV en boekhoudpakketten (Yuki, Exact Online, Odoo) wordt in de volgende release ondersteund.',
    }));
  };

  // Check if core fields are filled
  const hasCompanyInfo = !!selectedCompany || formData.companyName.length > 0;
  const hasBusinessType = !!selectedBusinessType || formData.businessType.length > 0;
  const hasFinancials = formData.yearlyFinancials.some(yf => yf.revenue > 0 && yf.ebitda > 0);
  const canSubmit = hasCompanyInfo && hasBusinessType && hasFinancials;

  // Field-level: detect partially filled years (has one of revenue/ebitda but not both)
  const partialYears = formData.yearlyFinancials
    .filter(yf => (yf.revenue > 0 && yf.ebitda <= 0) || (yf.ebitda > 0 && yf.revenue <= 0))
    .map(yf => yf.year);

  // Get current year normalizations for display
  const currentYearData = normalizedData.years.find(y => y.year === activeNormalizationYear);
  const totalCurrentYearAdjustment = currentYearData?.totalAdjustment || 0;

  // Calculate progress
  const totalSteps = 4;
  const completedSteps = [
    hasCompanyInfo && hasBusinessType, // Step 1: Company
    formData.ownerManagers > 0 && formData.fteEmployees > 0, // Step 2: Ownership
    hasFinancials, // Step 3: Financials
    normalizedData.years.some(y => y.normalizations.filter(n => n.enabled).length > 0), // Step 4: Normalizations
  ].filter(Boolean).length;

  return (
    <>
      <div className="h-full flex flex-col bg-background overflow-hidden">
        {/* Progress Header */}
        <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">{t('calculator.businessValuation')}</h2>
            <span className="text-xs font-medium text-foreground/50">
              {t('calculator.stepOf', { current: Math.max(1, completedSteps), total: totalSteps })}
            </span>
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map((step) => (
              <div 
                key={step}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  step <= completedSteps ? "bg-primary" : "bg-foreground/10"
                )}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            
            {/* Quick Actions moved to right panel for better UX */}
            
            {/* Step 0: Integration CTA - Show when no integration connected and not dismissed */}
            <AnimatePresence>
              {!connectedIntegration && !hideUploadHint && (
                <motion.section
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="rounded-xl p-4 bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 relative"
                >
                  {/* Dismiss button */}
                  <button
                    type="button"
                    onClick={() => setHideUploadHint(true)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg text-foreground/40 hover:text-foreground/60 hover:bg-foreground/5 transition-colors"
                    aria-label="Sluiten"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  
                  <div className="flex items-start gap-3 pr-6">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Link2 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-foreground mb-1">
                        Sneller met grootboek upload?
                      </h3>
                      <p className="text-xs text-foreground/60 mb-3">
                        Upload een grootboekexport (CSV) van Yuki, Exact of Odoo om rekeningen automatisch te categoriseren.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowConnectModal(true)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        Upload CSV
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
            
            {/* Step 1: Company Identification */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold",
                  selectedCompany ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
                )}>
                  {selectedCompany ? <Check className="w-3.5 h-3.5" /> : '1'}
                </div>
                <h3 className="text-sm font-medium text-foreground">
                  Bedrijfsgegevens
                </h3>
              </div>
              
              <KBOSearchInput
                label="Bedrijfsnaam of KBO-nummer"
                value={companySearchValue}
                onChange={setCompanySearchValue}
                onCompanySelect={handleCompanySelect}
                selectedCompany={selectedCompany}
                onClear={handleClearCompany}
                size="sm"
              />

              <AnimatePresence>
                {selectedCompany && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 overflow-hidden"
                  >
                    <BusinessTypeSearchInput
                      label="Bedrijfstype"
                      value={formData.businessType}
                      onChange={handleBusinessTypeSelect}
                      size="sm"
                    />
                    {selectedBusinessType && (
                      <p className="text-[11px] text-foreground/40 -mt-1">
                        Dit bedrijfstype bepaalt de benchmark data en multiples voor de schatting
                      </p>
                    )}

                    <AuroraSelect
                      label="Rechtsvorm"
                      options={businessStructures}
                      value={formData.businessStructure}
                      onChange={(val) => updateField('businessStructure', val)}
                      size="sm"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* Step 2: Ownership & Structure */}
            {selectedCompany && hasBusinessType && (
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 pt-2"
              >
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold",
                    formData.ownerManagers > 0 && formData.fteEmployees > 0 
                      ? "bg-success/10 text-success" 
                      : "bg-primary/10 text-primary"
                  )}>
                    {formData.ownerManagers > 0 && formData.fteEmployees > 0 ? <Check className="w-3.5 h-3.5" /> : '2'}
                  </div>
                  <h3 className="text-sm font-medium text-foreground">
                    Eigendom & Structuur
                  </h3>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="relative">
                    <AuroraInput
                      label="Eigenaar-managers"
                      type="number"
                      min={1}
                      max={10}
                      value={formData.ownerManagers || ''}
                      onChange={(e) => updateField('ownerManagers', Number(e.target.value))}
                      size="sm"
                      placeholder="1"
                    />
                    <div className="absolute right-1 top-0">
                      <FieldHelpTrigger
                        context={{
                          field: 'ownerManagers',
                          label: 'Eigenaar-managers',
                          value: formData.ownerManagers,
                          hint: 'Hoeveel eigenaar-managers zijn actief in de dagelijkse operaties?',
                        }}
                        onTrigger={onFieldHelpRequest}
                      />
                    </div>
                  </div>
                  <div>
                    <AuroraInput
                      label="Totaal FTE"
                      type="number"
                      min={0}
                      value={formData.fteEmployees || ''}
                      onChange={(e) => updateField('fteEmployees', Number(e.target.value))}
                      size="sm"
                      placeholder="10"
                    />
                    {(fieldValidation.errors.fteEmployees || fieldValidation.warnings.fteEmployees) && (
                      <p className={`text-[10px] mt-0.5 ${fieldValidation.errors.fteEmployees ? 'text-destructive' : 'text-warning'}`}>
                        {fieldValidation.errors.fteEmployees || fieldValidation.warnings.fteEmployees}
                      </p>
                    )}
                  </div>
                  <div>
                    <AuroraInput
                      label="Aandelenbelang %"
                      type="number"
                      min={1}
                      max={100}
                      value={formData.equityStake || ''}
                      onChange={(e) => updateField('equityStake', Number(e.target.value))}
                      size="sm"
                      placeholder="100"
                    />
                    {fieldValidation.errors.equityStake && (
                      <p className="text-[10px] mt-0.5 text-destructive">{fieldValidation.errors.equityStake}</p>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-foreground/40">
                  Deze gegevens beïnvloeden de risicopremie en meervoudscorrecties in de schatting
                </p>
              </motion.section>
            )}

            {/* Step 3: Multi-Year Financials */}
            {selectedCompany && hasBusinessType && (
              <motion.section 
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 pt-2"
              >
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold",
                    hasFinancials ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
                  )}>
                    {hasFinancials ? <Check className="w-3.5 h-3.5" /> : '3'}
                  </div>
                  <h3 className="text-sm font-medium text-foreground">
                    Financiële historie
                  </h3>
                </div>

                {/* Step indicator */}
                <div className="text-xs text-foreground/40 -mt-1 ml-8">
                  Vul omzet en EBITDA in → pas normalisaties toe → bekijk gewogen resultaat
                </div>

                {/* Aurora EBITDA Summary Card - Animated gradient border */}
                <motion.div 
                  className="relative rounded-xl overflow-hidden"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  {/* Animated Aurora gradient border */}
                  <div 
                    className="absolute inset-0 rounded-xl opacity-60"
                    style={{
                      background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(175 60% 50%) 25%, hsl(264 80% 60%) 50%, hsl(var(--primary)) 75%, hsl(175 60% 50%) 100%)',
                      backgroundSize: '300% 300%',
                      animation: 'aurora-shift 8s ease-in-out infinite',
                      padding: '1px',
                    }}
                  />
                  
                  {/* Inner content with solid background */}
                  <div className="relative m-[1px] rounded-[11px] bg-background p-4">
                    {/* Subtle inner glow */}
                    <div className="absolute inset-0 rounded-[11px] bg-gradient-to-br from-primary/[0.04] via-transparent to-violet-500/[0.04] pointer-events-none" />
                    
                    <div className="relative">
                      {/* Normalization Trigger - always visible when financials entered */}
                      {hasFinancials ? (
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/40">
                                Genormaliseerde EBITDA
                              </span>
                              {normalizedData.years.some(y => y.totalAdjustment !== 0) && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-success/10 text-success text-[9px] font-semibold uppercase tracking-wider">
                                  <Check className="w-2.5 h-2.5" />
                                  Genormaliseerd
                                </span>
                              )}
                            </div>
                            <div className="flex items-baseline gap-2">
                              <motion.span 
                                className="text-xl font-bold text-foreground font-mono tabular-nums"
                                key={normalizedData.averageNormalizedEbitda}
                                initial={{ scale: 1.05, opacity: 0.7 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                              >
                                {formatCurrency(normalizedData.averageNormalizedEbitda)}
                              </motion.span>
                              <span className="text-[10px] text-foreground/40">
                                ({normalizedData.totalYearsWithData} {normalizedData.totalYearsWithData === 1 ? 'jaar' : 'jaren'})
                              </span>
                              {normalizedData.years.some(y => y.totalAdjustment !== 0) && (
                                <motion.span 
                                  className="text-xs font-semibold text-success"
                                  initial={{ x: -4, opacity: 0 }}
                                  animate={{ x: 0, opacity: 1 }}
                                >
                                  +{formatCurrency(normalizedData.years.reduce((sum, y) => sum + y.totalAdjustment, 0) / Math.max(1, normalizedData.totalYearsWithData))}
                                </motion.span>
                              )}
                            </div>
                          </div>
                          <motion.button
                            type="button"
                            onClick={() => setShowNormalizationModal(true)}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className={cn(
                              "shrink-0 px-4 py-2 rounded-lg text-xs font-semibold transition-all",
                              normalizedData.years.some(y => y.totalAdjustment !== 0)
                                ? "bg-foreground/[0.04] text-foreground/70 hover:bg-foreground/[0.08] border border-foreground/[0.08]"
                                : "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-sm hover:shadow-md hover:shadow-primary/20"
                            )}
                          >
                            {normalizedData.years.some(y => y.totalAdjustment !== 0) ? 'Aanpassen' : 'Normaliseren'}
                          </motion.button>
                        </div>
                      ) : (
                        <p className="text-xs text-foreground/50 leading-relaxed">
                          <span className="text-foreground/70 font-medium">Waarom normaliseren?</span> Fiscaal-geoptimaliseerde cijfers onderschatten de werkelijke winst — dat maakt een groot verschil bij waardering. 
                          Normalisatie corrigeert eenmalige kosten en bovenmatige vergoedingen naar <span className="text-foreground/70">marktconforme niveaus</span>.
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
                
                {/* Year-by-year financial input */}
                <div className="space-y-3">
                  {formData.yearlyFinancials.map((yearData, index) => {
                    const normalizedYear = normalizedData.years.find(y => y.year === yearData.year);
                    const hasNormalizations = yearData.normalizations.filter(n => n.enabled).length > 0;
                    
                    return (
                      <div 
                        key={yearData.year} 
                        className={cn(
                          "p-3 rounded-xl border transition-colors",
                          partialYears.includes(yearData.year)
                            ? "border-warning/40 bg-warning/[0.03]"
                            : yearData.ebitda > 0 && yearData.revenue > 0
                              ? "border-foreground/[0.08] bg-foreground/[0.02]" 
                              : "border-dashed border-foreground/[0.06]"
                        )}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-semibold text-foreground">{yearData.year}</span>
                          {hasNormalizations && (
                            <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                              {yearData.normalizations.filter(n => n.enabled).length} normalisaties
                            </span>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <CurrencyInput
                              label="Omzet"
                              value={yearData.revenue}
                              onChange={(v) => updateYearlyFinancials(yearData.year, 'revenue', v)}
                              size="sm"
                              placeholder="1.500.000"
                            />
                            {(fieldValidation.warnings[`revenue-${yearData.year}`] || fieldValidation.errors[`revenue-${yearData.year}`]) && (
                              <p className={`text-[10px] mt-0.5 ${fieldValidation.errors[`revenue-${yearData.year}`] ? 'text-destructive' : 'text-warning'}`}>
                                {fieldValidation.errors[`revenue-${yearData.year}`] || fieldValidation.warnings[`revenue-${yearData.year}`]}
                              </p>
                            )}
                          </div>
                          <div className="relative">
                            <CurrencyInput
                              label="EBITDA"
                              value={yearData.ebitda}
                              onChange={(v) => updateYearlyFinancials(yearData.year, 'ebitda', v)}
                              size="sm"
                              placeholder="250.000"
                            />
                            {(fieldValidation.warnings[`ebitda-${yearData.year}`] || fieldValidation.errors[`ebitda-${yearData.year}`] || fieldValidation.warnings[`margin-${yearData.year}`]) && (
                              <p className={`text-[10px] mt-0.5 ${fieldValidation.errors[`ebitda-${yearData.year}`] ? 'text-destructive' : 'text-warning'}`}>
                                {fieldValidation.errors[`ebitda-${yearData.year}`] || fieldValidation.warnings[`ebitda-${yearData.year}`] || fieldValidation.warnings[`margin-${yearData.year}`]}
                              </p>
                            )}
                            <div className="absolute right-1 top-0">
                              <FieldHelpTrigger
                                context={{
                                  field: 'ebitda',
                                  label: `EBITDA ${yearData.year}`,
                                  value: yearData.ebitda,
                                  hint: 'Welke normalisaties zijn relevant voor deze EBITDA?',
                                  normalizationType: 'other',
                                }}
                                onTrigger={onFieldHelpRequest}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Show normalized EBITDA if different */}
                        {yearData.ebitda > 0 && normalizedYear && normalizedYear.normalizedEbitda !== yearData.ebitda && (
                          <div className="mt-2 flex items-center justify-between text-xs">
                            <span className="text-foreground/50">Genormaliseerde EBITDA:</span>
                            <span className="font-mono font-semibold text-success">
                              {formatCurrency(normalizedYear.normalizedEbitda)}
                              <span className="text-foreground/40 ml-1">
                                ({normalizedYear.totalAdjustment > 0 ? '+' : ''}{formatCurrency(normalizedYear.totalAdjustment)})
                              </span>
                            </span>
                          </div>
                        )}
                        {/* Partial year warning */}
                        {partialYears.includes(yearData.year) && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-warning">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>Vul zowel omzet als EBITDA in voor dit jaar</span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add Year Button */}
                  {formData.yearlyFinancials.length < 5 && (
                    <button
                      type="button"
                      onClick={() => {
                        const existingYears = formData.yearlyFinancials.map(yf => Number(yf.year));
                        const nextYear = Math.min(...existingYears) - 1;
                        updateField('yearlyFinancials', [
                          ...formData.yearlyFinancials,
                          { year: String(nextYear), revenue: 0, ebitda: 0, normalizations: [] },
                        ]);
                      }}
                      className="w-full p-3 rounded-xl border border-dashed border-foreground/[0.08] text-sm text-foreground/40 hover:text-foreground/60 hover:border-foreground/[0.15] hover:bg-foreground/[0.02] transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Jaar toevoegen ({Math.min(...formData.yearlyFinancials.map(yf => Number(yf.year))) - 1})
                    </button>
                  )}
                </div>

              </motion.section>
            )}
          </form>
        </div>

        {/* Fixed Bottom CTA */}
        <div className="shrink-0 px-6 py-4 border-t border-foreground/[0.06] bg-background">
          <AuroraButton
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={isCalculating}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {isCalculating ? 'Berekenen...' : 'Bereken Schatting'}
          </AuroraButton>
          {!canSubmit && (
            <p className="text-center text-xs text-foreground/40 mt-2">
              {!hasCompanyInfo 
                ? 'Vul een bedrijfsnaam in of zoek via KBO'
                : !hasBusinessType 
                  ? 'Selecteer een bedrijfstype'
                  : 'Vul minstens 1 jaar omzet én EBITDA in'
              }
            </p>
          )}
        </div>
      </div>

      {/* Unified Normalization Modal - Enhanced with presets, search, and granular control */}
      <UnifiedNormalizationModal
        open={showNormalizationModal}
        onOpenChange={setShowNormalizationModal}
        companyName={formData.companyName || 'Bedrijfsschatting'}
        currentYear={Number(activeNormalizationYear) || currentYear}
        originalEBITDA={currentYearData?.ebitda || 0}
        normalizations={unifiedNormalizations}
        onNormalizationsChange={(items) => {
          setUnifiedNormalizations(items);
          // Sync accepted normalizations back to yearly financials
          const acceptedAdjustment = items
            .filter(n => n.status === 'accepted')
            .reduce((sum, n) => sum + n.adjustment, 0);
          // Update the yearly financials with the new normalizations
          const updated = formData.yearlyFinancials.map(yf => {
            if (yf.year === activeNormalizationYear) {
              return {
                ...yf,
                normalizations: items.filter(n => n.status === 'accepted').map(n => ({
                  id: n.id,
                  code: n.ledgerCode,
                  name: n.ledgerName,
                  category: n.category,
                  originalValue: n.value,
                  adjustedValue: n.value + n.adjustment,
                  adjustment: n.adjustment,
                  reason: n.reason || '',
                  enabled: true,
                })),
              };
            }
            return yf;
          });
          updateField('yearlyFinancials', updated);
        }}
        hasUploadedData={!!connectedIntegration}
        onUploadClick={() => setShowConnectModal(true)}
      />

      {/* Upload CSV Modal */}
      <Modal open={showConnectModal} onOpenChange={setShowConnectModal}>
        <ModalContent className="max-w-md">
          <ModalHeader>
            <ModalTitle>Grootboek Importeren</ModalTitle>
          </ModalHeader>
          
          <div className="py-4 space-y-4">
            <p className="text-sm text-foreground/60">
              Upload een grootboekexport (CSV) van uw boekhoudsoftware. We herkennen automatisch Yuki, Exact en Odoo formaten.
            </p>
            
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  handleConnect('yuki');
                  setShowConnectModal(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 p-4 rounded-xl text-left",
                  "border border-foreground/[0.08] hover:border-primary/30",
                  "bg-foreground/[0.02] hover:bg-primary/5 transition-colors"
                )}
              >
                <div className="w-10 h-10 rounded-lg bg-[#00A4E4]/10 flex items-center justify-center shrink-0">
                  <span className="text-lg font-bold text-[#00A4E4]">Y</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Yuki Export</p>
                  <p className="text-xs text-foreground/50">Grootboek → Exporteren → CSV</p>
                </div>
                <FileSpreadsheet className="w-4 h-4 text-foreground/30" />
              </button>

              <button
                type="button"
                onClick={() => {
                  handleConnect('exact');
                  setShowConnectModal(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 p-4 rounded-xl text-left",
                  "border border-foreground/[0.08] hover:border-primary/30",
                  "bg-foreground/[0.02] hover:bg-primary/5 transition-colors"
                )}
              >
                <div className="w-10 h-10 rounded-lg bg-[#E94E1B]/10 flex items-center justify-center shrink-0">
                  <span className="text-lg font-bold text-[#E94E1B]">E</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Exact Export</p>
                  <p className="text-xs text-foreground/50">Rapportage → Grootboek → Excel</p>
                </div>
                <FileSpreadsheet className="w-4 h-4 text-foreground/30" />
              </button>

              <button
                type="button"
                onClick={() => {
                  handleConnect('odoo');
                  setShowConnectModal(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 p-4 rounded-xl text-left",
                  "border border-foreground/[0.08] hover:border-primary/30",
                  "bg-foreground/[0.02] hover:bg-primary/5 transition-colors"
                )}
              >
                <div className="w-10 h-10 rounded-lg bg-[#714B67]/10 flex items-center justify-center shrink-0">
                  <span className="text-lg font-bold text-[#714B67]">O</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Odoo Export</p>
                  <p className="text-xs text-foreground/50">Boekhouding → Rapporten → Export</p>
                </div>
                <FileSpreadsheet className="w-4 h-4 text-foreground/30" />
              </button>
            </div>

            <p className="text-xs text-foreground/40 text-center pt-2">
              Directe API-koppelingen komen binnenkort
            </p>
          </div>

          <ModalFooter>
            <AuroraButton variant="ghost" onClick={() => setShowConnectModal(false)}>
              Annuleren
            </AuroraButton>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
