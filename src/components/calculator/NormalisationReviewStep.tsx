'use client';

/**
 * Normalisation Review Step
 * 
 * H8 Hypothesis: "Een overzichtelijke Normalisatie Review (1 scherm, volledig controleerbaar)"
 * 
 * World-class fintech UX (Klarna/Stripe quality):
 * - Full inline editing for amounts with type selector (+€, -€, +%, -%, ABS)
 * - Ledger account search (grootboek zoekbalk) for manual additions
 * - Year scope toggles (current year / all years)
 * - Source attribution (Manual/Yuki/Exact Online/AI)
 * - Accept/Reject with undo capability
 * - 60/30/10 color compliant
 */

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Check, 
  X, 
  ChevronRight, 
  AlertCircle,
  Calculator,
  FileSpreadsheet,
  Search,
  Plus,
  Minus,
  Percent,
  Hash,
  Edit3,
  Calendar,
  CalendarRange,
  Undo2,
  Trash2,
  Sparkles
} from 'lucide-react';
import { cn } from '@/design-system/utils';
import { AuroraButton as Button } from '@/design-system/components/Button';
import { AuroraInput as Input } from '@/design-system/components/Input';
import { Checkbox } from '@/design-system/components/Checkbox';
import { DEFAULT_LEDGER_ACCOUNTS, type LedgerAccount } from '../../constants/grootboek';

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export type NormalizationType = 'add' | 'subtract' | 'add_percent' | 'subtract_percent' | 'absolute';
export type NormalizationSource = 'manual' | 'yuki' | 'exact' | 'csv' | 'ai';

export interface SuggestedNormalisation {
  id: string;
  code: string;
  description: string;
  category: 'salary' | 'rent' | 'vehicle' | 'one-time' | 'personal' | 'depreciation' | 'other';
  amount: number;
  reason: string;
  sourceRef?: string;
  status: 'pending' | 'accepted' | 'rejected';
  source?: NormalizationSource;
  type?: NormalizationType;
  applyAllYears?: boolean;
  marketBenchmark?: string;
}

export interface NormalisationReviewStepProps {
  suggestions: SuggestedNormalisation[];
  originalEbitda: number;
  companyName: string;
  sourceIntegration?: 'yuki' | 'exact' | 'odoo' | 'manual';
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onContinue: () => void;
  onBack: () => void;
  onUpdate?: (id: string, updates: Partial<SuggestedNormalisation>) => void;
  onAdd?: (normalisation: Omit<SuggestedNormalisation, 'id' | 'status'>) => void;
  onRemove?: (id: string) => void;
}

// ─────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────

const formatCurrency = (amount: number) => {
  if (Math.abs(amount) >= 1000000) {
    return `€${(amount / 1000000).toFixed(2)}M`;
  }
  if (Math.abs(amount) >= 1000) {
    return `€${(amount / 1000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const categoryLabelKeys: Record<SuggestedNormalisation['category'], string> = {
  salary: 'categories.salary',
  rent: 'categories.rent',
  vehicle: 'categories.vehicle',
  'one-time': 'categories.oneTime',
  personal: 'categories.personal',
  depreciation: 'categories.depreciation',
  other: 'categories.other',
};

const categoryIcons: Record<SuggestedNormalisation['category'], string> = {
  salary: '👤',
  rent: '🏢',
  vehicle: '🚗',
  'one-time': '⚡',
  personal: '🏠',
  depreciation: '📉',
  other: '📋',
};

const sourceLabels: Record<NormalizationSource, { labelKey: string; color: string }> = {
  manual: { labelKey: 'sources.manual', color: 'bg-foreground/10 text-foreground/70' },
  yuki: { labelKey: 'sources.yuki', color: 'bg-accent/10 text-accent' },
  exact: { labelKey: 'sources.exact', color: 'bg-info/10 text-info' },
  csv: { labelKey: 'sources.csv', color: 'bg-warning/10 text-warning' },
  ai: { labelKey: 'aiSuggestion', color: 'bg-primary/10 text-primary' },
};

const typeOptions: { value: NormalizationType; label: string; icon: typeof Plus }[] = [
  { value: 'add', label: '+€', icon: Plus },
  { value: 'subtract', label: '-€', icon: Minus },
  { value: 'add_percent', label: '+%', icon: Percent },
  { value: 'subtract_percent', label: '-%', icon: Percent },
  { value: 'absolute', label: 'ABS', icon: Hash },
];

const defaultLedgerAccounts = DEFAULT_LEDGER_ACCOUNTS;

// Quick presets with market-conform defaults (use labelKey/descriptionKey/reasonKey for i18n)
interface NormalizationPreset {
  id: string;
  labelKey: string;
  icon: string;
  code: string;
  descriptionKey: string;
  category: SuggestedNormalisation['category'];
  defaultAmount: number;
  reasonKey: string;
  marketBenchmark?: string;
}

const normalizationPresets: NormalizationPreset[] = [
  { id: 'owner-salary', labelKey: 'presets.ownerSalary', icon: '👤', code: '620', descriptionKey: 'presets.ownerSalaryDesc', category: 'salary', defaultAmount: 60000, reasonKey: 'presets.ownerSalaryReason', marketBenchmark: '€55K - €75K' },
  { id: 'family-salary', labelKey: 'presets.familySalary', icon: '👨‍👩‍👧', code: '620', descriptionKey: 'presets.familySalaryDesc', category: 'personal', defaultAmount: 35000, reasonKey: 'presets.familySalaryReason', marketBenchmark: '€25K - €40K' },
  { id: 'rent', labelKey: 'presets.rent', icon: '🏢', code: '613', descriptionKey: 'presets.rentDesc', category: 'rent', defaultAmount: 24000, reasonKey: 'presets.rentReason', marketBenchmark: '€150 - €250/m²' },
  { id: 'vehicle', labelKey: 'presets.vehicle', icon: '🚗', code: '615', descriptionKey: 'presets.vehicleDesc', category: 'vehicle', defaultAmount: 18000, reasonKey: 'presets.vehicleReason', marketBenchmark: '€12K - €24K/jaar' },
  { id: 'legal', labelKey: 'presets.legal', icon: '⚖️', code: '640', descriptionKey: 'presets.legalDesc', category: 'one-time', defaultAmount: 25000, reasonKey: 'presets.legalReason' },
  { id: 'advisory', labelKey: 'presets.advisory', icon: '📊', code: '617', descriptionKey: 'presets.advisoryDesc', category: 'one-time', defaultAmount: 15000, reasonKey: 'presets.advisoryReason' },
];

// ─────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────

export function NormalisationReviewStep({
  suggestions,
  originalEbitda,
  companyName,
  sourceIntegration = 'manual',
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  onContinue,
  onBack,
  onUpdate,
  onAdd,
  onRemove,
}: NormalisationReviewStepProps) {
  const nh = useTranslations('normalizationHub');
  const ca = useTranslations('chatAssistant');
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showLedgerDropdown, setShowLedgerDropdown] = useState(false);
  
  // Edit form state
  const [editAmount, setEditAmount] = useState('');
  const [editType, setEditType] = useState<NormalizationType>('add');
  const [editApplyAllYears, setEditApplyAllYears] = useState(false);
  const [editReason, setEditReason] = useState('');
  
  // Add form state
  const [selectedLedger, setSelectedLedger] = useState<LedgerAccount | null>(null);
  const [newAmount, setNewAmount] = useState('');
  const [newType, setNewType] = useState<NormalizationType>('add');
  const [newApplyAllYears, setNewApplyAllYears] = useState(false);
  const [newReason, setNewReason] = useState('');
  
  // Calculations
  const pendingCount = suggestions.filter(s => s.status === 'pending').length;
  const acceptedCount = suggestions.filter(s => s.status === 'accepted').length;
  const rejectedCount = suggestions.filter(s => s.status === 'rejected').length;
  
  const totalAcceptedAdjustment = suggestions
    .filter(s => s.status === 'accepted')
    .reduce((sum, s) => sum + s.amount, 0);
  
  const normalizedEbitda = originalEbitda + totalAcceptedAdjustment;
  
  const integrationLabels: Record<string, string> = {
    yuki: nh('sources.yuki'),
    exact: nh('sources.exact'),
    odoo: nh('sources.odoo'),
    manual: nh('sources.manual'),
  };
  
  // Filter ledger accounts based on search
  const filteredLedgers = useMemo(() => {
    if (!searchQuery) return defaultLedgerAccounts.slice(0, 6);
    const query = searchQuery.toLowerCase();
    return defaultLedgerAccounts.filter(
      (account) =>
        account.code.toLowerCase().includes(query) ||
        account.name.toLowerCase().includes(query)
    ).slice(0, 8);
  }, [searchQuery]);
  
  // Start editing a normalisation
  const startEditing = useCallback((suggestion: SuggestedNormalisation) => {
    setEditingId(suggestion.id);
    setEditAmount(Math.abs(suggestion.amount).toString());
    setEditType(suggestion.type || (suggestion.amount >= 0 ? 'add' : 'subtract'));
    setEditApplyAllYears(suggestion.applyAllYears || false);
    setEditReason(suggestion.reason || '');
  }, []);
  
  // Save edit
  const saveEdit = useCallback(() => {
    if (!editingId || !editAmount || !onUpdate) return;
    
    const numericValue = parseFloat(editAmount.replace(/[^0-9.-]/g, ''));
    if (isNaN(numericValue)) return;
    
    let calculatedAmount = numericValue;
    if (editType === 'subtract' || editType === 'subtract_percent') {
      calculatedAmount = -numericValue;
    }
    
    onUpdate(editingId, {
      amount: calculatedAmount,
      type: editType,
      applyAllYears: editApplyAllYears,
      reason: editReason || undefined,
    });
    
    setEditingId(null);
  }, [editingId, editAmount, editType, editApplyAllYears, editReason, onUpdate]);
  
  // Cancel edit
  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);
  
  // Add new normalisation from preset
  const addFromPreset = useCallback((preset: NormalizationPreset) => {
    if (!onAdd) return;
    
    onAdd({
      code: preset.code,
      description: nh(preset.descriptionKey),
      category: preset.category,
      amount: preset.defaultAmount,
      reason: nh(preset.reasonKey),
      source: 'manual',
      type: 'add',
      applyAllYears: false,
      marketBenchmark: preset.marketBenchmark,
    });
    
    setShowAddForm(false);
  }, [onAdd, nh]);
  
  // Add from ledger search
  const addFromLedger = useCallback(() => {
    if (!selectedLedger || !newAmount || !onAdd) return;
    
    const numericValue = parseFloat(newAmount.replace(/[^0-9.-]/g, ''));
    if (isNaN(numericValue)) return;
    
    let calculatedAmount = numericValue;
    if (newType === 'subtract' || newType === 'subtract_percent') {
      calculatedAmount = -numericValue;
    }
    
    // Map ledger code to category
    const getCategory = (code: string): SuggestedNormalisation['category'] => {
      if (code.startsWith('62')) return 'salary';
      if (code.startsWith('61')) return code === '613' ? 'rent' : code === '615' ? 'vehicle' : 'other';
      if (code.startsWith('64')) return 'one-time';
      if (code.startsWith('65')) return 'personal';
      if (code.startsWith('66')) return 'depreciation';
      return 'other';
    };
    
    onAdd({
      code: selectedLedger.code,
      description: selectedLedger.name,
      category: getCategory(selectedLedger.code),
      amount: calculatedAmount,
      reason: newReason || nh('manualCorrection', { name: selectedLedger.name }),
      source: 'manual',
      type: newType,
      applyAllYears: newApplyAllYears,
    });
    
    // Reset form
    setSelectedLedger(null);
    setNewAmount('');
    setNewReason('');
    setSearchQuery('');
    setShowAddForm(false);
  }, [selectedLedger, newAmount, newType, newApplyAllYears, newReason, onAdd, nh]);
  
  const handleAcceptAll = () => {
    setIsProcessing(true);
    onAcceptAll();
    setTimeout(() => setIsProcessing(false), 300);
  };
  
  const handleContinue = () => {
    setIsProcessing(true);
    setTimeout(() => {
      onContinue();
      setIsProcessing(false);
    }, 500);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 px-4 md:px-6 py-4 md:py-5 border-b border-foreground/[0.06]">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Calculator className="w-4 h-4 md:w-5 md:h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-semibold text-foreground truncate">Normalisatie Review</h2>
            <p className="text-xs md:text-sm text-foreground/50 truncate">{companyName}</p>
          </div>
        </div>
        
        {/* Source Badge */}
        <div className="flex items-center gap-2 mt-3">
          <div className="flex items-center gap-1.5 px-2 py-0.5 md:px-2.5 md:py-1 rounded-full bg-foreground/[0.04] text-[10px] md:text-xs text-foreground/60 border border-foreground/[0.08]">
            <FileSpreadsheet className="w-3 h-3" />
            <span>{integrationLabels[sourceIntegration]}</span>
          </div>
          <span className="text-[10px] md:text-xs text-foreground/40">
            {nh('adjustmentsCount', { count: suggestions.length })}
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="shrink-0 px-4 md:px-6 py-3 md:py-4 border-b border-foreground/[0.06] bg-foreground/[0.01]">
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          <div className="text-center">
            <p className="text-[8px] md:text-[10px] font-medium text-foreground/40 uppercase tracking-wider mb-0.5 md:mb-1">
              {nh('original')}
            </p>
            <p className="text-sm md:text-lg font-mono font-semibold text-foreground/70 line-through">
              {formatCurrency(originalEbitda)}
            </p>
          </div>
          
          <div className="text-center">
            <p className="text-[8px] md:text-[10px] font-medium text-foreground/40 uppercase tracking-wider mb-0.5 md:mb-1">
              {nh('adjustment')}
            </p>
            <p className={cn(
              "text-sm md:text-lg font-mono font-semibold",
              totalAcceptedAdjustment > 0 ? "text-success" : 
              totalAcceptedAdjustment < 0 ? "text-secondary" : "text-foreground/40"
            )}>
              {totalAcceptedAdjustment > 0 ? '+' : ''}{formatCurrency(totalAcceptedAdjustment)}
            </p>
          </div>
          
          <div className="text-center">
            <p className="text-[8px] md:text-[10px] font-medium text-primary uppercase tracking-wider mb-0.5 md:mb-1">
              {nh('normalized')}
            </p>
            <p className="text-sm md:text-lg font-mono font-bold text-foreground">
              {formatCurrency(normalizedEbitda)}
            </p>
          </div>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="shrink-0 px-4 md:px-6 py-2 md:py-3 border-b border-foreground/[0.06] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-4 text-[10px] md:text-xs text-foreground/50">
          <span>{acceptedCount} ✓</span>
          <span>{rejectedCount} ✗</span>
          {pendingCount > 0 && (
            <span className="text-primary font-medium">{pendingCount} {nh('toReviewShort')}</span>
          )}
        </div>
        
        {pendingCount > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRejectAll}
              className="text-foreground/50 text-xs px-2 md:px-3"
            >
              {nh('rejectAll')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAcceptAll}
              className="text-xs px-2 md:px-3"
            >
              {nh('acceptAll')}
            </Button>
          </div>
        )}
      </div>

      {/* Suggestions List */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-3 md:py-4">
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {suggestions.map((suggestion, index) => {
              const isEditing = editingId === suggestion.id;
              const source = suggestion.source || 'manual';
              
              return (
                <motion.div
                  key={suggestion.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.02 }}
                  className={cn(
                    "rounded-xl border transition-all overflow-hidden",
                    suggestion.status === 'pending' 
                      ? "bg-foreground/[0.02] border-foreground/[0.08]"
                      : suggestion.status === 'accepted'
                        ? "bg-success/5 border-success/20"
                        : "bg-foreground/[0.01] border-foreground/[0.04] opacity-50"
                  )}
                >
                  {isEditing ? (
                    // ─────────────────────────────────────────
                    // EDIT MODE
                    // ─────────────────────────────────────────
                    <div className="p-4 space-y-4">
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{categoryIcons[suggestion.category]}</span>
                          <span className="text-sm font-medium text-foreground">{suggestion.description}</span>
                        </div>
                        <button
                          onClick={cancelEdit}
                          className="p-1.5 rounded-lg hover:bg-foreground/10"
                        >
                          <X className="w-4 h-4 text-foreground/40" />
                        </button>
                      </div>
                      
                      {/* Type & Amount */}
                      <div className="flex gap-2">
                        <div className="flex gap-0.5">
                          {typeOptions.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => setEditType(option.value)}
                              className={cn(
                                "px-2.5 py-2 rounded-lg text-xs font-medium transition-all",
                                editType === option.value
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-foreground/[0.04] text-foreground/60 hover:bg-foreground/[0.08]"
                              )}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40 text-sm">
                            {editType.includes('percent') ? '%' : '€'}
                          </span>
                          <Input
                            type="text"
                            placeholder={nh('amountPlaceholder')}
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            className="pl-8 font-mono text-base"
                          />
                        </div>
                      </div>
                      
                      {/* Year Toggle */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={editApplyAllYears}
                          onChange={(checked) => setEditApplyAllYears(checked)}
                        />
                        <span className="text-xs text-foreground/60 flex items-center gap-1">
                          <CalendarRange className="w-3 h-3" />
                          Toepassen op alle jaren
                        </span>
                      </label>
                      
                      {/* Reason */}
                      <Input
                        placeholder={nh('explanationOptionalPlaceholder')}
                        value={editReason}
                        onChange={(e) => setEditReason(e.target.value)}
                        className="text-sm"
                      />
                      
                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={cancelEdit} className="flex-1">
                          {nh('actions.cancel')}
                        </Button>
                        <Button variant="primary" size="sm" onClick={saveEdit} className="flex-1 gap-1">
                          <Check className="w-3.5 h-3.5" />
                          {nh('actions.save')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // ─────────────────────────────────────────
                    // VIEW MODE
                    // ─────────────────────────────────────────
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 md:p-4">
                      {/* Left: Icon + Details */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-foreground/[0.04] flex items-center justify-center text-base md:text-lg shrink-0">
                          {categoryIcons[suggestion.category]}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-sm font-medium text-foreground truncate">
                              {suggestion.description}
                            </span>
                            <span className={cn(
                              "shrink-0 text-[8px] md:text-[9px] px-1.5 py-0.5 rounded font-medium",
                              sourceLabels[source].color
                            )}>
                              {nh(sourceLabels[source].labelKey)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs text-foreground/50 flex-wrap">
                            <span className="font-mono text-foreground/40">{suggestion.code}</span>
                            <span className="hidden sm:inline">·</span>
                            <span>{nh(categoryLabelKeys[suggestion.category])}</span>
                            {suggestion.applyAllYears && (
                              <>
                                <span className="hidden sm:inline">·</span>
                                <span className="flex items-center gap-0.5 text-primary">
                                  <CalendarRange className="w-2.5 h-2.5" />
                                  {nh('allYears')}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Amount + Actions */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 pl-11 sm:pl-0">
                        <div className="shrink-0 text-right">
                          <p className={cn(
                            "text-sm md:text-base font-mono font-semibold",
                            suggestion.amount > 0 ? "text-success" : "text-secondary"
                          )}>
                            {suggestion.amount > 0 ? '+' : ''}{formatCurrency(suggestion.amount)}
                          </p>
                          {suggestion.marketBenchmark && (
                            <p className="text-[9px] text-foreground/40">
                              {nh('marketPrefix')} {suggestion.marketBenchmark}
                            </p>
                          )}
                        </div>

                        {suggestion.status === 'pending' ? (
                          <div className="flex items-center gap-1 shrink-0">
                            {/* Edit button */}
                            {onUpdate && (
                              <button
                                onClick={() => startEditing(suggestion)}
                                className="w-9 h-9 md:w-8 md:h-8 rounded-lg flex items-center justify-center hover:bg-foreground/[0.06] transition-colors"
                                aria-label={nh('actions.edit')}
                              >
                                <Edit3 className="w-3.5 h-3.5 text-foreground/40" />
                              </button>
                            )}
                            <button
                              onClick={() => onReject(suggestion.id)}
                              className="w-10 h-10 md:w-9 md:h-9 rounded-lg flex items-center justify-center hover:bg-foreground/[0.06] transition-colors"
                              aria-label={ca('reject')}
                            >
                              <X className="w-4 h-4 text-foreground/40" />
                            </button>
                            <button
                              onClick={() => onAccept(suggestion.id)}
                              className="w-10 h-10 md:w-9 md:h-9 rounded-lg flex items-center justify-center bg-primary/10 hover:bg-primary/20 transition-colors"
                              aria-label={ca('accept')}
                            >
                              <Check className="w-4 h-4 text-primary" />
                            </button>
                          </div>
                        ) : suggestion.status === 'accepted' ? (
                          <div className="shrink-0 flex items-center gap-1">
                            {onUpdate && (
                              <button
                                onClick={() => startEditing(suggestion)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-foreground/[0.06] transition-colors"
                                aria-label={nh('actions.edit')}
                              >
                                <Edit3 className="w-3.5 h-3.5 text-foreground/40" />
                              </button>
                            )}
                            <div className="flex items-center gap-1 text-[10px] md:text-xs text-success font-medium px-2 py-1 rounded-full bg-success/10">
                              <Check className="w-3 h-3" />
                              <span className="hidden sm:inline">{ca('accepted')}</span>
                              <span className="sm:hidden">OK</span>
                            </div>
                          </div>
                        ) : (
                          <div className="shrink-0 flex items-center gap-1">
                            <button
                              onClick={() => onAccept(suggestion.id)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-foreground/[0.06] transition-colors"
                              aria-label={nh('actions.undo')}
                            >
                              <Undo2 className="w-3.5 h-3.5 text-foreground/40" />
                            </button>
                            <div className="flex items-center gap-1 text-[10px] md:text-xs text-foreground/40 font-medium px-2 py-1 rounded-full bg-foreground/[0.04]">
                              <X className="w-3 h-3" />
                              <span className="hidden sm:inline">{ca('rejected')}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Empty State */}
        {suggestions.length === 0 && !showAddForm && (
          <div className="text-center py-12">
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-foreground/[0.04] flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 md:w-8 md:h-8 text-foreground/30" />
            </div>
            <p className="text-foreground/60 mb-1 text-sm md:text-base">{nh('noNormalizationsDetected')}</p>
            <p className="text-xs md:text-sm text-foreground/40 mb-4">
              {nh('noAdjustmentsInData')}
            </p>
            {onAdd && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAddForm(true)}
                className="gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                {nh('addManually')}
              </Button>
            )}
          </div>
        )}

        {/* Add Normalization Form */}
        {onAdd && (
          <div className="mt-4 pt-4 border-t border-foreground/[0.06]">
            {!showAddForm ? (
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full p-3 rounded-xl border border-dashed border-foreground/10 hover:border-primary/30 hover:bg-primary/[0.02] transition-all flex items-center justify-center gap-2 text-sm text-foreground/50 hover:text-primary"
              >
                <Plus className="w-4 h-4" />
                {nh('addNormalization')}
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 p-4 rounded-xl bg-foreground/[0.02] border border-foreground/[0.08]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground/60">
                    {nh('addNormalization')}
                  </span>
                  <button
                    onClick={() => {
                      setShowAddForm(false);
                      setSelectedLedger(null);
                      setSearchQuery('');
                    }}
                    className="p-1 rounded hover:bg-foreground/10"
                  >
                    <X className="w-3.5 h-3.5 text-foreground/40" />
                  </button>
                </div>

                {/* Quick Presets */}
                {!selectedLedger && (
                  <>
                    <div className="space-y-2">
                      <span className="text-[10px] font-medium text-foreground/40 uppercase tracking-wider">
                        Snelkeuzes
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {normalizationPresets.slice(0, 4).map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() => addFromPreset(preset)}
                            className="p-2.5 rounded-xl bg-foreground/[0.02] border border-foreground/[0.06] hover:border-primary/30 hover:bg-primary/[0.02] transition-all text-left group"
                          >
                            <div className="flex items-start gap-2">
                              <span className="text-sm">{preset.icon}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-foreground/80 group-hover:text-foreground truncate">
                                  {nh(preset.labelKey)}
                                </p>
                                <p className="text-[10px] text-foreground/40">
                                  +{formatCurrency(preset.defaultAmount)}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-foreground/[0.06]" />
                      <span className="text-[10px] text-foreground/30 uppercase">{nh('orSearch')}</span>
                      <div className="flex-1 h-px bg-foreground/[0.06]" />
                    </div>
                  </>
                )}

                {/* Ledger Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                  <Input
                    placeholder={nh('searchLedgerPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowLedgerDropdown(true);
                      setSelectedLedger(null);
                    }}
                    onFocus={() => setShowLedgerDropdown(true)}
                    className="pl-10 text-base"
                  />

                  {/* Dropdown */}
                  <AnimatePresence>
                    {showLedgerDropdown && !selectedLedger && searchQuery && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="absolute z-50 w-full mt-1 py-1 bg-background border border-foreground/10 rounded-lg shadow-lg max-h-48 overflow-y-auto"
                      >
                        {filteredLedgers.map((account) => (
                          <button
                            key={account.code}
                            onClick={() => {
                              setSelectedLedger(account);
                              setSearchQuery(`${account.code} · ${account.name}`);
                              setShowLedgerDropdown(false);
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-foreground/[0.04] flex items-center gap-3 transition-colors"
                          >
                            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-foreground/[0.06] text-foreground/60">
                              {account.code}
                            </span>
                            <span className="text-sm text-foreground/80 truncate">
                              {account.name}
                            </span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Selected Ledger Form */}
                {selectedLedger && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-4"
                  >
                    {/* Selected Pill */}
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {selectedLedger.code}
                      </span>
                      <span className="text-sm text-foreground/80 flex-1 truncate">
                        {selectedLedger.name}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedLedger(null);
                          setSearchQuery('');
                        }}
                        className="p-1 rounded hover:bg-foreground/10"
                      >
                        <X className="w-3 h-3 text-foreground/40" />
                      </button>
                    </div>

                    {/* Type & Amount */}
                    <div className="flex gap-2">
                      <div className="flex gap-0.5">
                        {typeOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setNewType(option.value)}
                            className={cn(
                              "px-2.5 py-2 rounded-lg text-xs font-medium transition-all",
                              newType === option.value
                                ? "bg-primary text-primary-foreground"
                                : "bg-foreground/[0.04] text-foreground/60 hover:bg-foreground/[0.08]"
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40 text-sm">
                          {newType.includes('percent') ? '%' : '€'}
                        </span>
                        <Input
                          type="text"
                          placeholder={nh('amountPlaceholder')}
                          value={newAmount}
                          onChange={(e) => setNewAmount(e.target.value)}
                          className="pl-8 font-mono text-base"
                        />
                      </div>
                    </div>

                    {/* Year Toggle */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={newApplyAllYears}
                        onChange={(checked) => setNewApplyAllYears(checked)}
                      />
                      <span className="text-xs text-foreground/60 flex items-center gap-1">
                        <CalendarRange className="w-3 h-3" />
                        Toepassen op alle jaren
                      </span>
                    </label>

                    {/* Reason */}
                    <Input
                      placeholder={nh('explanationOptionalPlaceholder')}
                      value={newReason}
                      onChange={(e) => setNewReason(e.target.value)}
                      className="text-sm"
                    />

                    {/* Add Button */}
                    <Button
                      onClick={addFromLedger}
                      disabled={!newAmount}
                      className="w-full gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      {nh('actions.add')}
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Footer CTA */}
      <div className="shrink-0 px-4 md:px-6 py-3 md:py-4 border-t border-foreground/[0.06] bg-background">
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <Button
            variant="ghost"
            onClick={onBack}
            disabled={isProcessing}
            className="w-full sm:w-auto"
          >
            {nh('back')}
          </Button>
          <Button
            variant="primary"
            className="flex-1 gap-2"
            onClick={handleContinue}
            loading={isProcessing}
            disabled={pendingCount > 0}
          >
            {pendingCount > 0 
              ? `${pendingCount} ${nh('pendingToReview')}`
              : nh('continueToEstimate')
            }
            {pendingCount === 0 && <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>
        
        {pendingCount > 0 && (
          <p className="text-center text-[10px] md:text-xs text-foreground/40 mt-2">
            {nh('reviewAllToContinue')}
          </p>
        )}
      </div>
    </div>
  );
}

export default NormalisationReviewStep;
