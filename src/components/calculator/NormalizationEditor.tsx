'use client';

/**
 * Normalization Editor Modal
 * 
 * Full-featured editor for creating and customizing EBITDA normalizations.
 * Features:
 * - Ledger account search (grootboek zoekbalk)
 * - Type selector (+€, -€, +%, -%, ABS)
 * - Year selection checkboxes (this year / all years)
 * - Source badges (Manual/Yuki/Exact Online)
 * - Per-normalization modularity
 */

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Plus,
  Minus,
  Percent,
  Hash,
  Check,
  X,
  Calendar,
  CalendarRange,
  FileSpreadsheet,
  PenLine,
  Upload,
  ChevronDown,
  Trash2,
  Info
} from 'lucide-react';
import { cn } from '@/design-system/utils';
import { AuroraButton as Button } from '@/design-system/components/Button';
import { AuroraInput as Input } from '@/design-system/components/Input';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalFooter } from '@/design-system/components/Modal';
import { Checkbox } from '@/design-system/components/Checkbox';
import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent } from '@/design-system/components/Tooltip';

// Types for normalization data
export type NormalizationType = 'add' | 'subtract' | 'add_percent' | 'subtract_percent' | 'absolute';
export type NormalizationSource = 'manual' | 'yuki' | 'exact' | 'csv';

export interface LedgerAccount {
  code: string;
  name: string;
  category?: string;
  balance?: number;
}

export interface Normalization {
  id: string;
  ledgerCode: string;
  ledgerName: string;
  type: NormalizationType;
  value: number;
  calculatedAdjustment?: number;
  applyThisYear: boolean;
  applyAllYears: boolean;
  source: NormalizationSource;
  reason?: string;
  year?: number;
}

export interface NormalizationEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledgerAccounts?: LedgerAccount[];
  existingNormalizations?: Normalization[];
  onSave: (normalizations: Normalization[]) => void;
  currentYear?: number;
  hasUploadedData?: boolean;
  companyName?: string;
}

// Mock ledger accounts for demo (when no data uploaded)
const defaultLedgerAccounts: LedgerAccount[] = [
  { code: '620', name: 'Bezoldigingen bestuurders', category: 'Personeelskosten' },
  { code: '621', name: 'Werkgeversbijdragen RSZ', category: 'Personeelskosten' },
  { code: '613', name: 'Huurkosten', category: 'Diensten en diverse goederen' },
  { code: '614', name: 'Energie en water', category: 'Diensten en diverse goederen' },
  { code: '615', name: 'Voertuigkosten', category: 'Diensten en diverse goederen' },
  { code: '616', name: 'Verzekeringen', category: 'Diensten en diverse goederen' },
  { code: '617', name: 'Erelonen en vergoedingen', category: 'Diensten en diverse goederen' },
  { code: '640', name: 'Eenmalige kosten', category: 'Andere bedrijfskosten' },
  { code: '650', name: 'Privékosten zaakvoerder', category: 'Andere bedrijfskosten' },
  { code: '660', name: 'Afschrijvingen', category: 'Afschrijvingen' },
  { code: '661', name: 'Waardeverminderingen', category: 'Afschrijvingen' },
];

const typeOptions: { value: NormalizationType; label: string; icon: typeof Plus; description: string }[] = [
  { value: 'add', label: '+€', icon: Plus, description: 'Bedrag toevoegen' },
  { value: 'subtract', label: '-€', icon: Minus, description: 'Bedrag aftrekken' },
  { value: 'add_percent', label: '+%', icon: Percent, description: 'Percentage toevoegen' },
  { value: 'subtract_percent', label: '-%', icon: Percent, description: 'Percentage aftrekken' },
  { value: 'absolute', label: 'ABS', icon: Hash, description: 'Doelwaarde instellen' },
];

const sourceOptions: { value: NormalizationSource; label: string; color: string }[] = [
  { value: 'manual', label: 'Manueel', color: 'bg-foreground/10 text-foreground/70' },
  { value: 'yuki', label: 'Yuki', color: 'bg-accent/10 text-accent' },
  { value: 'exact', label: 'Exact Online', color: 'bg-info/10 text-info' },
  { value: 'csv', label: 'CSV Import', color: 'bg-warning/10 text-warning' },
];

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const generateId = () => Math.random().toString(36).substring(2, 11);

export function NormalizationEditor({
  open,
  onOpenChange,
  ledgerAccounts = [],
  existingNormalizations = [],
  onSave,
  currentYear = new Date().getFullYear(),
  hasUploadedData = false,
  companyName,
}: NormalizationEditorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [normalizations, setNormalizations] = useState<Normalization[]>(existingNormalizations);
  const [selectedLedger, setSelectedLedger] = useState<LedgerAccount | null>(null);
  const [showLedgerDropdown, setShowLedgerDropdown] = useState(false);
  
  // New normalization form state
  const [newType, setNewType] = useState<NormalizationType>('add');
  const [newValue, setNewValue] = useState('');
  const [newApplyThisYear, setNewApplyThisYear] = useState(true);
  const [newApplyAllYears, setNewApplyAllYears] = useState(false);
  const [newSource, setNewSource] = useState<NormalizationSource>('manual');
  const [newReason, setNewReason] = useState('');

  // Use uploaded ledger accounts or defaults
  const availableLedgers = useMemo(() => {
    return ledgerAccounts.length > 0 ? ledgerAccounts : defaultLedgerAccounts;
  }, [ledgerAccounts]);

  // Filter ledger accounts based on search
  const filteredLedgers = useMemo(() => {
    if (!searchQuery) return availableLedgers.slice(0, 10);
    const query = searchQuery.toLowerCase();
    return availableLedgers.filter(
      (account) =>
        account.code.toLowerCase().includes(query) ||
        account.name.toLowerCase().includes(query)
    ).slice(0, 10);
  }, [searchQuery, availableLedgers]);

  // Calculate adjustment based on type and value
  const calculateAdjustment = useCallback((type: NormalizationType, value: number, currentBalance?: number): number => {
    switch (type) {
      case 'add':
        return value;
      case 'subtract':
        return -value;
      case 'add_percent':
        return currentBalance ? (currentBalance * value) / 100 : 0;
      case 'subtract_percent':
        return currentBalance ? -(currentBalance * value) / 100 : 0;
      case 'absolute':
        return currentBalance ? value - currentBalance : value;
      default:
        return 0;
    }
  }, []);

  // Add new normalization
  const handleAddNormalization = () => {
    if (!selectedLedger || !newValue) return;

    const numericValue = parseFloat(newValue.replace(/[^0-9.-]/g, ''));
    if (isNaN(numericValue)) return;

    const newNormalization: Normalization = {
      id: generateId(),
      ledgerCode: selectedLedger.code,
      ledgerName: selectedLedger.name,
      type: newType,
      value: numericValue,
      calculatedAdjustment: calculateAdjustment(newType, numericValue, selectedLedger.balance),
      applyThisYear: newApplyThisYear,
      applyAllYears: newApplyAllYears,
      source: newSource,
      reason: newReason || undefined,
      year: currentYear,
    };

    setNormalizations([...normalizations, newNormalization]);
    
    // Reset form
    setSelectedLedger(null);
    setNewValue('');
    setNewReason('');
    setSearchQuery('');
  };

  // Remove normalization
  const handleRemoveNormalization = (id: string) => {
    setNormalizations(normalizations.filter((n) => n.id !== id));
  };

  // Save all normalizations
  const handleSave = () => {
    onSave(normalizations);
    onOpenChange(false);
  };

  // Calculate totals
  const totalAdjustment = useMemo(() => {
    return normalizations.reduce((sum, n) => sum + (n.calculatedAdjustment || n.value), 0);
  }, [normalizations]);

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <ModalHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
            </div>
            <div>
              <ModalTitle className="text-base">
                EBITDA Normalisaties
              </ModalTitle>
              <p className="text-xs text-foreground/50 mt-0.5">
                {companyName || 'Bedrijfsschatting'} · {currentYear}
              </p>
            </div>
          </div>
        </ModalHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Search & Add Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground/60 uppercase tracking-wider">
              <Plus className="w-3.5 h-3.5" />
              Normalisatie toevoegen
            </div>

            {/* Ledger Search */}
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                <Input
                  placeholder="Zoek grootboekrekening (bijv. 613, huur...)"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowLedgerDropdown(true);
                  }}
                  onFocus={() => setShowLedgerDropdown(true)}
                  className="pl-10 text-base"
                />
                {selectedLedger && (
                  <button
                    onClick={() => {
                      setSelectedLedger(null);
                      setSearchQuery('');
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-foreground/10"
                  >
                    <X className="w-3.5 h-3.5 text-foreground/40" />
                  </button>
                )}
              </div>

              {/* Ledger Dropdown */}
              <AnimatePresence>
                {showLedgerDropdown && !selectedLedger && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="absolute z-50 w-full mt-1 py-1 bg-background border border-foreground/10 rounded-lg shadow-lg max-h-64 overflow-y-auto"
                  >
                    {filteredLedgers.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-foreground/50 text-center">
                        {hasUploadedData 
                          ? 'Geen rekeningen gevonden'
                          : 'Upload data om in grootboek te zoeken'}
                      </div>
                    ) : (
                      filteredLedgers.map((account) => (
                        <button
                          key={account.code}
                          onClick={() => {
                            setSelectedLedger(account);
                            setSearchQuery(`${account.code} · ${account.name}`);
                            setShowLedgerDropdown(false);
                          }}
                          className="w-full px-4 py-2.5 text-left hover:bg-foreground/[0.04] flex items-center justify-between group transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs px-2 py-0.5 rounded bg-foreground/[0.06] text-foreground/60 group-hover:bg-primary/10 group-hover:text-primary">
                              {account.code}
                            </span>
                            <span className="text-sm text-foreground/80">
                              {account.name}
                            </span>
                          </div>
                          {account.balance !== undefined && (
                            <span className="text-xs font-mono text-foreground/40">
                              {formatCurrency(account.balance)}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Selected Ledger Form */}
            <AnimatePresence>
              {selectedLedger && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 p-4 rounded-xl bg-foreground/[0.02] border border-foreground/[0.08]"
                >
                  {/* Type Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground/60">
                      Type aanpassing
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {typeOptions.map((option) => (
                        <TooltipProvider key={option.value}>
                          <TooltipRoot>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => setNewType(option.value)}
                                className={cn(
                                  "px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5",
                                  newType === option.value
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "bg-foreground/[0.04] text-foreground/60 hover:bg-foreground/[0.08]"
                                )}
                              >
                                <option.icon className="w-3.5 h-3.5" />
                                {option.label}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{option.description}</p>
                            </TooltipContent>
                          </TooltipRoot>
                        </TooltipProvider>
                      ))}
                    </div>
                  </div>

                  {/* Value Input */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground/60">
                      {newType.includes('percent') ? 'Percentage' : newType === 'absolute' ? 'Doelwaarde' : 'Bedrag'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40 text-sm">
                        {newType.includes('percent') ? '%' : '€'}
                      </span>
                      <Input
                        type="text"
                        placeholder={newType.includes('percent') ? '10' : '60.000'}
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        className="pl-8 font-mono text-base"
                      />
                    </div>
                  </div>

                  {/* Year Selection */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground/60">
                      Toepassen op
                    </label>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <Checkbox
                          checked={newApplyThisYear}
                          onChange={(checked) => setNewApplyThisYear(checked)}
                        />
                        <span className="text-sm text-foreground/70 group-hover:text-foreground flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          Dit jaar ({currentYear})
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <Checkbox
                          checked={newApplyAllYears}
                          onChange={(checked) => setNewApplyAllYears(checked)}
                        />
                        <span className="text-sm text-foreground/70 group-hover:text-foreground flex items-center gap-1.5">
                          <CalendarRange className="w-3.5 h-3.5" />
                          Alle jaren
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Source Selection */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground/60">
                      Bron
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {sourceOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setNewSource(option.value)}
                          className={cn(
                            "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                            newSource === option.value
                              ? cn(option.color, "ring-2 ring-offset-2 ring-offset-background ring-primary/20")
                              : "bg-foreground/[0.04] text-foreground/50 hover:bg-foreground/[0.08]"
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Reason (Optional) */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground/60">
                      Toelichting <span className="text-foreground/30">(optioneel)</span>
                    </label>
                    <Input
                      placeholder="Bijv. Eigenaarssalaris boven marktwaarde"
                      value={newReason}
                      onChange={(e) => setNewReason(e.target.value)}
                      className="text-base"
                    />
                  </div>

                  {/* Add Button */}
                  <Button
                    onClick={handleAddNormalization}
                    disabled={!newValue}
                    className="w-full gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Normalisatie toevoegen
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Existing Normalizations List */}
          {normalizations.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground/60 uppercase tracking-wider">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Toegevoegde normalisaties ({normalizations.length})
                </div>
                <div className="text-sm font-mono font-semibold text-primary">
                  {totalAdjustment >= 0 ? '+' : ''}{formatCurrency(totalAdjustment)}
                </div>
              </div>

              <div className="space-y-2">
                {normalizations.map((normalization) => {
                  const sourceOption = sourceOptions.find((s) => s.value === normalization.source);
                  const typeOption = typeOptions.find((t) => t.value === normalization.type);
                  
                  return (
                    <motion.div
                      key={normalization.id}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="p-3 rounded-lg bg-foreground/[0.02] border border-foreground/[0.08] hover:border-foreground/[0.12] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-foreground/[0.06] text-foreground/60">
                              {normalization.ledgerCode}
                            </span>
                            <span className="text-sm font-medium text-foreground/80 truncate">
                              {normalization.ledgerName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {/* Type Badge */}
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                              {typeOption?.label}
                              <span className="font-mono">
                                {normalization.type.includes('percent') 
                                  ? `${normalization.value}%`
                                  : formatCurrency(normalization.value)}
                              </span>
                            </span>
                            {/* Source Badge */}
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-medium",
                              sourceOption?.color
                            )}>
                              {sourceOption?.label}
                            </span>
                            {/* Year Badge */}
                            {normalization.applyAllYears ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-foreground/[0.06] text-foreground/50">
                                <CalendarRange className="w-2.5 h-2.5" />
                                Alle jaren
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-foreground/[0.06] text-foreground/50">
                                <Calendar className="w-2.5 h-2.5" />
                                {normalization.year || currentYear}
                              </span>
                            )}
                          </div>
                          {normalization.reason && (
                            <p className="text-xs text-foreground/50 mt-1.5 truncate">
                              {normalization.reason}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-sm font-mono font-semibold",
                            (normalization.calculatedAdjustment || normalization.value) >= 0 
                              ? "text-success" 
                              : "text-secondary"
                          )}>
                            {(normalization.calculatedAdjustment || normalization.value) >= 0 ? '+' : ''}
                            {formatCurrency(normalization.calculatedAdjustment || normalization.value)}
                          </span>
                          <button
                            onClick={() => handleRemoveNormalization(normalization.id)}
                            className="p-1.5 rounded-lg text-foreground/30 hover:text-secondary hover:bg-secondary/10 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty State */}
          {normalizations.length === 0 && !selectedLedger && (
            <div className="py-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-foreground/[0.04] flex items-center justify-center mx-auto mb-3">
                <PenLine className="w-5 h-5 text-foreground/30" />
              </div>
              <p className="text-sm text-foreground/50 mb-1">
                Geen normalisaties toegevoegd
              </p>
              <p className="text-xs text-foreground/40">
                {hasUploadedData 
                  ? 'Zoek een grootboekrekening om te normaliseren'
                  : 'Upload data of voeg handmatig normalisaties toe'}
              </p>
            </div>
          )}
        </div>

        <ModalFooter className="border-t border-foreground/[0.06]">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm">
              {normalizations.length > 0 && (
                <span className="text-foreground/50">
                  Totale impact: {' '}
                  <span className={cn(
                    "font-mono font-semibold",
                    totalAdjustment >= 0 ? "text-success" : "text-secondary"
                  )}>
                    {totalAdjustment >= 0 ? '+' : ''}{formatCurrency(totalAdjustment)}
                  </span>
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Annuleren
              </Button>
              <Button
                onClick={handleSave}
                className="gap-1.5"
              >
                <Check className="w-4 h-4" />
                Opslaan ({normalizations.length})
              </Button>
            </div>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default NormalizationEditor;
