'use client';

/**
 * Unified Normalization Modal
 * 
 * Single source of truth for all EBITDA normalizations.
 * Features integrated Yuki/Exact/CSV upload and grootboekcode-centric UI.
 * 
 * Entry points:
 * - Sidebar "Normalisaties" button
 * - Chat commands (e.g., "Normaliseer huur")
 * - Quick Actions panel clicks
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  Plus,
  Minus,
  Percent,
  Hash,
  Check,
  X,
  Calendar,
  CalendarRange,
  FileSpreadsheet,
  Upload,
  Trash2,
  Sparkles,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Edit3,
  Search,
  PenLine,
  LayoutGrid,
  LayoutList,
  ChevronDown,
  Square,
  CheckSquare,
  Minus as MinusSquare,
  Table2,
} from 'lucide-react';
import { NormalizationTableView, NormalizationBentoView } from './NormalizationViews';
import { cn } from '@/design-system/utils';
import { AuroraButton as Button } from '@/design-system/components/Button';
import { AuroraInput as Input } from '@/design-system/components/Input';
import { Modal, ModalContent, ModalTitle, ModalFooter } from '@/design-system/components/Modal';
import { Checkbox } from '@/design-system/components/Checkbox';
// Tabs removed - using plain buttons for status filters to avoid indicator bug
import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent } from '@/design-system/components/Tooltip';


// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export type NormalizationType = 'add' | 'subtract' | 'add_percent' | 'subtract_percent' | 'absolute';
export type NormalizationSource = 'manual' | 'yuki' | 'exact' | 'csv' | 'ai';
export type NormalizationStatus = 'pending' | 'accepted' | 'rejected';

export interface LedgerAccount {
  code: string;
  name: string;
  category?: string;
  balance?: number;
}

export interface NormalizationItem {
  id: string;
  ledgerCode: string;
  ledgerName: string;
  category: 'salary' | 'rent' | 'vehicle' | 'one-time' | 'personal' | 'depreciation' | 'other';
  type: NormalizationType;
  value: number;
  adjustment: number;
  reason?: string;
  source: NormalizationSource;
  sourceRef?: string;
  status: NormalizationStatus;
  applyAllYears: boolean;
  applyYears?: number[]; // Specific years this normalization applies to
  year: number;
  confidence?: 'high' | 'medium' | 'low';
  marketBenchmark?: number;
}

export interface UnifiedNormalizationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
  currentYear?: number;
  originalEBITDA: number;
  normalizations: NormalizationItem[];
  onNormalizationsChange: (normalizations: NormalizationItem[]) => void;
  ledgerAccounts?: LedgerAccount[];
  hasUploadedData?: boolean;
  onUploadClick?: () => void;
  initialSearchQuery?: string;
}

// ─────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────

const categoryConfig: Record<NormalizationItem['category'], { icon: string; label: string }> = {
  salary: { icon: '👤', label: 'Eigenaarssalaris' },
  rent: { icon: '🏢', label: 'Huurkosten' },
  vehicle: { icon: '🚗', label: 'Voertuigkosten' },
  'one-time': { icon: '⚡', label: 'Eenmalige kosten' },
  personal: { icon: '🏠', label: 'Privékosten' },
  depreciation: { icon: '📉', label: 'Afschrijvingen' },
  other: { icon: '📋', label: 'Overige' },
};

const sourceConfig: Record<NormalizationSource, { label: string; color: string }> = {
  manual: { label: 'Manueel', color: 'bg-foreground/10 text-foreground/70' },
  yuki: { label: 'Yuki', color: 'bg-accent/10 text-accent' },
  exact: { label: 'Exact Online', color: 'bg-info/10 text-info' },
  csv: { label: 'CSV', color: 'bg-warning/10 text-warning' },
  ai: { label: 'AI Suggestie', color: 'bg-primary/10 text-primary' },
};

const typeOptions: { value: NormalizationType; label: string; icon: typeof Plus }[] = [
  { value: 'add', label: '+€', icon: Plus },
  { value: 'subtract', label: '-€', icon: Minus },
  { value: 'add_percent', label: '+%', icon: Percent },
  { value: 'subtract_percent', label: '-%', icon: Percent },
  { value: 'absolute', label: 'ABS', icon: Hash },
];

const defaultLedgerAccounts: LedgerAccount[] = [
  // Personeelskosten (62x)
  { code: '620', name: 'Bezoldigingen bestuurders', category: 'Personeelskosten' },
  { code: '621', name: 'Werkgeversbijdragen RSZ', category: 'Personeelskosten' },
  { code: '622', name: 'Bezoldigingen personeel', category: 'Personeelskosten' },
  { code: '623', name: 'Pensioenpremies', category: 'Personeelskosten' },
  { code: '624', name: 'Vorming en opleiding', category: 'Personeelskosten' },
  { code: '625', name: 'Maaltijdcheques', category: 'Personeelskosten' },
  // Diensten en diverse goederen (61x)
  { code: '610', name: 'Aankopen handelsgoederen', category: 'Aankopen' },
  { code: '611', name: 'Aankopen grondstoffen', category: 'Aankopen' },
  { code: '612', name: 'Onderhoudskosten', category: 'Diensten en diverse goederen' },
  { code: '613', name: 'Huurkosten', category: 'Diensten en diverse goederen' },
  { code: '614', name: 'Energie en water', category: 'Diensten en diverse goederen' },
  { code: '615', name: 'Voertuigkosten', category: 'Diensten en diverse goederen' },
  { code: '616', name: 'Verzekeringen', category: 'Diensten en diverse goederen' },
  { code: '617', name: 'Erelonen en vergoedingen', category: 'Diensten en diverse goederen' },
  { code: '618', name: 'Telecom en IT', category: 'Diensten en diverse goederen' },
  { code: '619', name: 'Kantoorkosten', category: 'Diensten en diverse goederen' },
  // Andere bedrijfskosten (64x, 65x)
  { code: '640', name: 'Eenmalige kosten', category: 'Andere bedrijfskosten' },
  { code: '641', name: 'Representatiekosten', category: 'Andere bedrijfskosten' },
  { code: '642', name: 'Reclame en publiciteit', category: 'Andere bedrijfskosten' },
  { code: '643', name: 'Bankkosten', category: 'Andere bedrijfskosten' },
  { code: '644', name: 'Juridische kosten', category: 'Andere bedrijfskosten' },
  { code: '645', name: 'Boetes en sancties', category: 'Andere bedrijfskosten' },
  { code: '650', name: 'Privékosten zaakvoerder', category: 'Andere bedrijfskosten' },
  { code: '651', name: 'Restaurantkosten', category: 'Andere bedrijfskosten' },
  { code: '652', name: 'Reiskosten', category: 'Andere bedrijfskosten' },
  // Afschrijvingen (66x)
  { code: '660', name: 'Afschrijvingen', category: 'Afschrijvingen' },
  { code: '661', name: 'Afschrijvingen gebouwen', category: 'Afschrijvingen' },
  { code: '662', name: 'Afschrijvingen machines', category: 'Afschrijvingen' },
  { code: '663', name: 'Afschrijvingen voertuigen', category: 'Afschrijvingen' },
  { code: '664', name: 'Afschrijvingen inventaris', category: 'Afschrijvingen' },
  // Financiële kosten (65x, 67x)
  { code: '657', name: 'Interestkosten', category: 'Financiële kosten' },
  { code: '658', name: 'Wisselkoersverschillen', category: 'Financiële kosten' },
  { code: '670', name: 'Financiële kosten leningen', category: 'Financiële kosten' },
];

// Fuzzy search helper - matches characters in order but not necessarily adjacent
const fuzzyMatch = (text: string, query: string): { matches: boolean; score: number; indices: number[] } => {
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase().trim();
  
  if (!queryLower) return { matches: true, score: 0, indices: [] };
  
  // Exact match gets highest score
  if (textLower.includes(queryLower)) {
    const startIndex = textLower.indexOf(queryLower);
    return { 
      matches: true, 
      score: 100 - startIndex, 
      indices: Array.from({ length: queryLower.length }, (_, i) => startIndex + i)
    };
  }
  
  // Fuzzy match: characters must appear in order
  let queryIndex = 0;
  const indices: number[] = [];
  
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      indices.push(i);
      queryIndex++;
    }
  }
  
  if (queryIndex === queryLower.length) {
    // Score based on how compact the match is (closer characters = higher score)
    const spread = indices[indices.length - 1] - indices[0];
    const score = 50 - spread + (indices[0] === 0 ? 20 : 0);
    return { matches: true, score, indices };
  }
  
  return { matches: false, score: -1, indices: [] };
};

// Quick presets for common normalizations with market-conform defaults
interface NormalizationPreset {
  id: string;
  label: string;
  icon: string;
  ledgerCode: string;
  ledgerName: string;
  category: NormalizationItem['category'];
  defaultType: NormalizationType;
  defaultValue: number;
  description: string;
  marketBenchmark?: string;
}

const normalizationPresets: NormalizationPreset[] = [
  {
    id: 'owner-salary',
    label: 'Eigenaarssalaris',
    icon: '', // Text-only for B2B professional feel
    ledgerCode: '620',
    ledgerName: 'Bezoldigingen bestuurders',
    category: 'salary',
    defaultType: 'add',
    defaultValue: 60000,
    description: 'Correctie naar marktconform niveau',
    marketBenchmark: '€55K - €75K',
  },
  {
    id: 'family-salary',
    label: 'Familielid salaris',
    icon: '',
    ledgerCode: '620',
    ledgerName: 'Bezoldigingen familieleden',
    category: 'personal',
    defaultType: 'add',
    defaultValue: 35000,
    description: 'Salaris boven marktwaarde familielid',
    marketBenchmark: '€25K - €40K',
  },
  {
    id: 'rent-office',
    label: 'Huurkosten',
    icon: '',
    ledgerCode: '613',
    ledgerName: 'Huurkosten',
    category: 'rent',
    defaultType: 'add',
    defaultValue: 24000,
    description: 'Huur boven/onder marktwaarde',
    marketBenchmark: '€150 - €250/m²',
  },
  {
    id: 'vehicle-costs',
    label: 'Autokosten',
    icon: '',
    ledgerCode: '615',
    ledgerName: 'Voertuigkosten',
    category: 'vehicle',
    defaultType: 'add',
    defaultValue: 18000,
    description: 'Privégebruik bedrijfsvoertuig',
    marketBenchmark: '€12K - €24K/jaar',
  },
  {
    id: 'one-time-legal',
    label: 'Juridische kosten',
    icon: '',
    ledgerCode: '640',
    ledgerName: 'Eenmalige kosten',
    category: 'one-time',
    defaultType: 'add',
    defaultValue: 25000,
    description: 'Rechtszaak of schikking',
  },
  {
    id: 'one-time-advisory',
    label: 'Advieskosten',
    icon: '',
    ledgerCode: '617',
    ledgerName: 'Erelonen en vergoedingen',
    category: 'one-time',
    defaultType: 'add',
    defaultValue: 15000,
    description: 'Consultancy of due diligence',
  },
  {
    id: 'restructuring',
    label: 'Herstructurering',
    icon: '',
    ledgerCode: '640',
    ledgerName: 'Herstructureringskosten',
    category: 'one-time',
    defaultType: 'add',
    defaultValue: 50000,
    description: 'Eenmalige reorganisatiekosten',
  },
  {
    id: 'depreciation',
    label: 'Afschrijvingen',
    icon: '',
    ledgerCode: '660',
    ledgerName: 'Afschrijvingen',
    category: 'depreciation',
    defaultType: 'add',
    defaultValue: 20000,
    description: 'Versnelde of abnormale afschrijving',
  },
  {
    id: 'personal-expenses',
    label: 'Privékosten',
    icon: '',
    ledgerCode: '650',
    ledgerName: 'Privékosten zaakvoerder',
    category: 'personal',
    defaultType: 'add',
    defaultValue: 12000,
    description: 'Persoonlijke uitgaven via bedrijf',
  },
  {
    id: 'asset-sale',
    label: 'Verkoop activa',
    icon: '',
    ledgerCode: '740',
    ledgerName: 'Meerwaarden op activa',
    category: 'one-time',
    defaultType: 'subtract',
    defaultValue: 30000,
    description: 'Eenmalige opbrengst verkoop',
  },
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


// ─────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────

export function UnifiedNormalizationModal({
  open,
  onOpenChange,
  companyName,
  currentYear = new Date().getFullYear(),
  originalEBITDA,
  normalizations,
  onNormalizationsChange,
  ledgerAccounts = [],
  onUploadClick,
  initialSearchQuery = '',
}: UnifiedNormalizationModalProps) {
  const nh = useTranslations('normalizationHub');
  const ca = useTranslations('chatAssistant');
  const tCommon = useTranslations('common.actions');
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');
  
  // View mode: bento (cards), compact (table rows), or financial (multi-year table)
  const [viewMode, setViewMode] = useState<'bento' | 'compact' | 'financial'>('compact');
  
  // Year filter: null = all years
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  
  // Note: We use searchQuery for both adding new normalizations AND filtering existing ones
  

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Smart default: show "Te beoordelen" only if there ARE pending items when modal opens
  useEffect(() => {
    if (open) {
      const pendingCount = normalizations.filter(n => n.status === 'pending').length;
      setActiveTab(pendingCount > 0 ? 'pending' : 'all');
      // Reset selection when modal opens
      setSelectedIds(new Set());
    }
  }, [open]);

  // Ensure overlays never persist between modal sessions
  useEffect(() => {
    if (!open) {
      setShowLedgerDropdown(false);
      setInputRect(null);
    } else {
      // Never auto-open the dropdown when the modal appears
      setShowLedgerDropdown(false);
    }
  }, [open]);
  
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedLedger, setSelectedLedger] = useState<LedgerAccount | null>(null);
  const [showLedgerDropdown, setShowLedgerDropdown] = useState(false);
  
  // New normalization form state
  const [newType, setNewType] = useState<NormalizationType>('add');
  const [newValue, setNewValue] = useState('');
  const [newSelectedYears, setNewSelectedYears] = useState<number[]>([currentYear]);
  const [newReason, setNewReason] = useState('');
  
  // Ref for add form to scroll into view
  const addFormRef = useRef<HTMLDivElement>(null);
  
  // Ref for input container to position dropdown via portal
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const [inputRect, setInputRect] = useState<DOMRect | null>(null);
  
  // Update input rect when dropdown should show
  useEffect(() => {
    if (showLedgerDropdown && inputContainerRef.current) {
      setInputRect(inputContainerRef.current.getBoundingClientRect());
    }
  }, [showLedgerDropdown, searchQuery]);
  
  // Year grouping: collapsed state for each year
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(new Set());
  
  // Scroll add form into view when it appears
  useEffect(() => {
    if (showAddForm && addFormRef.current) {
      // Small delay to allow animation to start
      setTimeout(() => {
        addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }, [showAddForm]);

  // Available years for selection (current year + 3 previous years)
  const availableYears = useMemo(() => {
    return [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];
  }, [currentYear]);

  // Get unique years from normalizations for filter
  const yearsInData = useMemo(() => {
    const years = new Set<number>();
    normalizations.forEach(n => {
      if (n.applyYears && n.applyYears.length > 0) {
        n.applyYears.forEach(y => years.add(y));
      } else {
        years.add(n.year);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [normalizations]);

  // Fetch grootboek codes from Titan API, fall back to hardcoded defaults
  const [fetchedLedgers, setFetchedLedgers] = useState<LedgerAccount[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/reference/grootboek')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (cancelled || !data?.codes) return;
        setFetchedLedgers(
          data.codes.map((c: { code: string; name: string; category: string }) => ({
            code: c.code,
            name: c.name,
            category: c.category,
          })),
        );
      })
      .catch(() => {}); // Fallback to defaults silently
    return () => { cancelled = true; };
  }, []);

  // Available ledger accounts: prop > API fetch > hardcoded defaults
  const availableLedgers = useMemo(() => {
    if (ledgerAccounts.length > 0) return ledgerAccounts;
    if (fetchedLedgers.length > 0) return fetchedLedgers;
    return defaultLedgerAccounts;
  }, [ledgerAccounts, fetchedLedgers]);

  // Filter ledger accounts based on search with fuzzy matching
  const filteredLedgers = useMemo(() => {
    const query = searchQuery.trim();
    
    if (!query) {
      // Show all accounts when no query, grouped by category
      return availableLedgers.slice(0, 12);
    }
    
    // Apply fuzzy search to both code and name
    const results = availableLedgers
      .map((account) => {
        const codeMatch = fuzzyMatch(account.code, query);
        const nameMatch = fuzzyMatch(account.name, query);
        const categoryMatch = account.category ? fuzzyMatch(account.category, query) : { matches: false, score: -1, indices: [] };
        
        // Take the best match
        const bestMatch = [codeMatch, nameMatch, categoryMatch].reduce((best, current) => 
          current.score > best.score ? current : best
        );
        
        return {
          account,
          matches: codeMatch.matches || nameMatch.matches || categoryMatch.matches,
          score: bestMatch.score,
          codeIndices: codeMatch.matches ? codeMatch.indices : [],
          nameIndices: nameMatch.matches ? nameMatch.indices : [],
        };
      })
      .filter(r => r.matches)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    
    return results.map(r => ({
      ...r.account,
      _codeIndices: r.codeIndices,
      _nameIndices: r.nameIndices,
    }));
  }, [searchQuery, availableLedgers]);

  // Calculate totals
  const totals = useMemo(() => {
    const acceptedNormalizations = normalizations.filter(n => n.status === 'accepted');
    const totalAdjustment = acceptedNormalizations.reduce((sum, n) => sum + n.adjustment, 0);
    return {
      original: originalEBITDA,
      adjustment: totalAdjustment,
      normalized: originalEBITDA + totalAdjustment,
    };
  }, [normalizations, originalEBITDA]);

  // Filter normalizations by tab, year, and search
  const filteredNormalizations = useMemo(() => {
    let result = normalizations;
    
    // Filter by status
    switch (activeTab) {
      case 'pending':
        result = result.filter(n => n.status === 'pending');
        break;
      case 'accepted':
        result = result.filter(n => n.status === 'accepted');
        break;
      case 'rejected':
        result = result.filter(n => n.status === 'rejected');
        break;
    }
    
    // Filter by year
    if (yearFilter !== null) {
      result = result.filter(n => {
        if (n.applyYears && n.applyYears.length > 0) {
          return n.applyYears.includes(yearFilter);
        }
        return n.year === yearFilter;
      });
    }
    
    // Filter by search query (using main searchQuery for dual-purpose input)
    if (searchQuery.trim() && !showAddForm) {
      const query = searchQuery.toLowerCase();
      result = result.filter(n => 
        n.ledgerCode.toLowerCase().includes(query) ||
        n.ledgerName.toLowerCase().includes(query) ||
        (n.reason && n.reason.toLowerCase().includes(query))
      );
    }
    
    return result;
  }, [normalizations, activeTab, yearFilter, searchQuery, showAddForm]);

  // Group normalizations by year for collapsible sections
  const groupedByYear = useMemo(() => {
    const groups = new Map<number, NormalizationItem[]>();
    
    filteredNormalizations.forEach(n => {
      // Use the primary year for grouping
      const primaryYear = n.applyYears && n.applyYears.length > 0 
        ? Math.max(...n.applyYears) 
        : n.year;
      
      if (!groups.has(primaryYear)) {
        groups.set(primaryYear, []);
      }
      groups.get(primaryYear)!.push(n);
    });
    
    // Sort years descending
    return Array.from(groups.entries())
      .sort(([a], [b]) => b - a)
      .map(([year, items]) => ({ year, items }));
  }, [filteredNormalizations]);
  
  // Toggle year collapse
  const toggleYearCollapse = useCallback((year: number) => {
    setCollapsedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  }, []);

  // Counts per status
  const counts = useMemo(() => ({
    pending: normalizations.filter(n => n.status === 'pending').length,
    accepted: normalizations.filter(n => n.status === 'accepted').length,
    rejected: normalizations.filter(n => n.status === 'rejected').length,
    all: normalizations.length,
  }), [normalizations]);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editType, setEditType] = useState<NormalizationType>('add');
  const [editValue, setEditValue] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editSelectedYears, setEditSelectedYears] = useState<number[]>([currentYear]);

  // Virtualization ref
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Bulk selection handlers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredNormalizations.map(n => n.id)));
  }, [filteredNormalizations]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isAllSelected = filteredNormalizations.length > 0 && 
    filteredNormalizations.every(n => selectedIds.has(n.id));
  const isSomeSelected = filteredNormalizations.some(n => selectedIds.has(n.id));

  // Actions
  const updateStatus = useCallback((id: string, status: NormalizationStatus) => {
    onNormalizationsChange(
      normalizations.map(n => n.id === id ? { ...n, status } : n)
    );
  }, [normalizations, onNormalizationsChange]);

  const bulkUpdateStatus = useCallback((status: NormalizationStatus) => {
    onNormalizationsChange(
      normalizations.map(n => selectedIds.has(n.id) ? { ...n, status } : n)
    );
    setSelectedIds(new Set());
  }, [normalizations, onNormalizationsChange, selectedIds]);

  const bulkDelete = useCallback(() => {
    onNormalizationsChange(
      normalizations.filter(n => !selectedIds.has(n.id))
    );
    setSelectedIds(new Set());
  }, [normalizations, onNormalizationsChange, selectedIds]);

  const startEditing = useCallback((item: NormalizationItem) => {
    // Set editing ID to track which item we're editing
    setEditingId(item.id);
    
    // Populate the top form with the item's data
    setSelectedLedger({
      code: item.ledgerCode,
      name: item.ledgerName,
    });
    setSearchQuery(`${item.ledgerCode} · ${item.ledgerName}`);
    setNewType(item.type);
    setNewValue(Math.abs(item.value).toString());
    setNewReason(item.reason || '');
    setNewSelectedYears(item.applyYears || (item.applyAllYears ? [...availableYears] : [item.year]));
    
    // Show the form
    setShowAddForm(true);
    setShowLedgerDropdown(false);
  }, [availableYears]);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    // Also reset the form
    setShowAddForm(false);
    setSelectedLedger(null);
    setSearchQuery('');
    setNewValue('');
    setNewReason('');
    setNewSelectedYears([currentYear]);
  }, [currentYear]);

  const saveEdit = useCallback(() => {
    if (!editingId || !editValue) return;

    const numericValue = parseFloat(editValue.replace(/[^0-9.-]/g, ''));
    if (isNaN(numericValue)) return;

    // Calculate adjustment based on type
    let adjustment = numericValue;
    if (editType === 'add_percent') {
      adjustment = originalEBITDA * numericValue / 100;
    } else if (editType === 'subtract_percent') {
      adjustment = -(originalEBITDA * numericValue / 100);
    } else if (editType === 'subtract') {
      adjustment = -numericValue;
    } else if (editType === 'absolute') {
      adjustment = numericValue - originalEBITDA;
    }

    onNormalizationsChange(
      normalizations.map(n => 
        n.id === editingId 
          ? { 
              ...n, 
              type: editType, 
              value: numericValue, 
              adjustment, 
              reason: editReason || undefined,
              applyAllYears: editSelectedYears.length === availableYears.length,
              applyYears: editSelectedYears,
            } 
          : n
      )
    );
    setEditingId(null);
  }, [editingId, editValue, editType, editReason, editSelectedYears, availableYears.length, normalizations, onNormalizationsChange]);

  const acceptAll = useCallback(() => {
    onNormalizationsChange(
      normalizations.map(n => n.status === 'pending' ? { ...n, status: 'accepted' } : n)
    );
  }, [normalizations, onNormalizationsChange]);

  const rejectAll = useCallback(() => {
    onNormalizationsChange(
      normalizations.map(n => n.status === 'pending' ? { ...n, status: 'rejected' } : n)
    );
  }, [normalizations, onNormalizationsChange]);

  const removeNormalization = useCallback((id: string) => {
    onNormalizationsChange(normalizations.filter(n => n.id !== id));
  }, [normalizations, onNormalizationsChange]);

  const addNormalization = useCallback(() => {
    if (!selectedLedger || !newValue) return;

    const numericValue = parseFloat(newValue.replace(/[^0-9.-]/g, ''));
    if (isNaN(numericValue)) return;

    // ── Validation: warn/block extreme adjustments ──
    const absValue = Math.abs(numericValue);
    if (originalEBITDA > 0) {
      const pctOfEbitda = (absValue / originalEBITDA) * 100;

      // Block if adjustment exceeds 200% of EBITDA (likely a data entry error)
      if (pctOfEbitda > 200) {
        import('sonner').then(({ toast }) =>
          toast.error(nh('blockedToast'), {
            description: nh('blockedToastDesc', { pct: pctOfEbitda.toFixed(0) }),
          })
        );
        return;
      }

      // Warn if adjustment exceeds 30% of EBITDA
      if (pctOfEbitda > 30) {
        import('sonner').then(({ toast }) =>
          toast.warning('Hoge normalisatie', {
            description: nh('warnToastDesc', { pct: pctOfEbitda.toFixed(0) }),
          })
        );
      }
    }

    // Calculate adjustment based on type
    let adjustment = numericValue;
    if (newType === 'add_percent') {
      adjustment = originalEBITDA * numericValue / 100;
    } else if (newType === 'subtract_percent') {
      adjustment = -(originalEBITDA * numericValue / 100);
    } else if (newType === 'subtract') {
      adjustment = -numericValue;
    } else if (newType === 'absolute') {
      // Absolute: the adjustment is the difference from original
      adjustment = numericValue - originalEBITDA;
    }

    // If editing an existing item, update it instead of creating new
    if (editingId) {
      onNormalizationsChange(
        normalizations.map(n => 
          n.id === editingId 
            ? { 
                ...n, 
                ledgerCode: selectedLedger.code,
                ledgerName: selectedLedger.name,
                type: newType, 
                value: numericValue, 
                adjustment, 
                reason: newReason || undefined,
                applyAllYears: newSelectedYears.length === availableYears.length,
                applyYears: newSelectedYears,
              } 
            : n
        )
      );
      setEditingId(null);
    } else {
      // Create new normalization
      const newItem: NormalizationItem = {
        id: generateId(),
        ledgerCode: selectedLedger.code,
        ledgerName: selectedLedger.name,
        category: 'other',
        type: newType,
        value: numericValue,
        adjustment,
        reason: newReason || undefined,
        source: 'manual',
        status: 'accepted',
        applyAllYears: newSelectedYears.length === availableYears.length,
        applyYears: newSelectedYears,
        year: currentYear,
      };

      // Prepend new item to top of list for better UX
      onNormalizationsChange([newItem, ...normalizations]);
    }
    
    // Reset form
    setSelectedLedger(null);
    setNewValue('');
    setNewReason('');
    setSearchQuery('');
    setNewSelectedYears([currentYear]);
    setShowAddForm(false);
  }, [selectedLedger, newValue, newType, newReason, newSelectedYears, availableYears.length, currentYear, normalizations, onNormalizationsChange, editingId]);

  // File input ref for CSV upload
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadClick) {
      onUploadClick();
    }
  };

  // Handle AI prompt submission - parse for ledger code/name and values
  const handlePromptSubmit = useCallback((value: string) => {
    // Try to parse the input for ledger codes (3-digit numbers)
    const codeMatch = value.match(/\b(\d{3})\b/);
    // Try to parse for amounts (€60.000 or 60000 or 60k)
    const amountMatch = value.match(/€?\s*(\d{1,3}(?:[.,]\d{3})*|\d+)(?:k)?/i);

    if (codeMatch) {
      const code = codeMatch[1];
      const matchingLedger = availableLedgers.find(l => l.code === code);
      if (matchingLedger) {
        setSelectedLedger(matchingLedger);
        setShowAddForm(true);
        
        if (amountMatch) {
          let amount = amountMatch[1].replace(/[.,]/g, '');
          if (value.toLowerCase().includes('k')) {
            amount = String(parseInt(amount) * 1000);
          }
          setNewValue(amount);
        }
        return;
      }
    }

    // Fallback: try to match preset by name
    const lowerValue = value.toLowerCase();
    const matchingPreset = normalizationPresets.find(p => 
      lowerValue.includes(p.label.toLowerCase()) || 
      lowerValue.includes(p.ledgerName.toLowerCase())
    );

    if (matchingPreset) {
      setSelectedLedger({
        code: matchingPreset.ledgerCode,
        name: matchingPreset.ledgerName,
      });
      setNewType(matchingPreset.defaultType);
      setNewValue(matchingPreset.defaultValue.toString());
      setNewReason(matchingPreset.description);
      setShowAddForm(true);
      return;
    }

    // If no match, show dropdown with search
    setSearchQuery(value);
    setShowLedgerDropdown(true);
  }, [availableLedgers]);

  // Import source picker state
  const [showImportPicker, setShowImportPicker] = useState(false);
  const [selectedImportSource, setSelectedImportSource] = useState<'yuki' | 'exact' | 'custom' | null>(null);
  const uploadButtonRef = useRef<HTMLButtonElement>(null);
  const [uploadButtonRect, setUploadButtonRect] = useState<DOMRect | null>(null);

  const handleUploadClick = () => {
    if (uploadButtonRef.current) {
      setUploadButtonRect(uploadButtonRef.current.getBoundingClientRect());
    }
    setShowImportPicker(!showImportPicker);
  };

  const handleImportSourceSelect = (source: 'yuki' | 'exact' | 'custom') => {
    setSelectedImportSource(source);
    setShowImportPicker(false);
    // Coming soon - no backend yet
    import('sonner').then(({ toast }) => toast.info('CSV import komt in de volgende versie', { description: `Directe koppeling met ${source === 'yuki' ? 'Yuki' : source === 'exact' ? 'Exact Online' : source} wordt ontwikkeld.` }));
  };

  // Virtualizer for compact mode
  const rowVirtualizer = useVirtualizer({
    count: filteredNormalizations.length,
    getScrollElement: () => listContainerRef.current,
    estimateSize: () => viewMode === 'compact' ? 48 : 80,
    overscan: 10,
  });

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="sm:max-w-5xl lg:max-w-6xl xl:max-w-7xl max-h-[92vh] flex flex-col p-0" size="full">
        {/* Header - Compact with EBITDA summary inline */}
        <div className="px-6 py-3 border-b border-foreground/[0.06] flex items-center justify-between pr-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
            </div>
            <div>
              <ModalTitle className="text-sm font-semibold">
                {nh('ebitdaNormalizations')}
              </ModalTitle>
              <p className="text-xs text-foreground/50">
                {companyName}
              </p>
            </div>
          </div>
          
          {/* Inline EBITDA Summary - Compact */}
          <div className="flex items-center gap-4 lg:gap-6">
            <div className="text-right">
              <p className="text-[9px] font-medium text-foreground/40 uppercase tracking-wider">Origineel</p>
              <p className="text-sm font-mono font-medium text-foreground/50">
                {formatCurrency(totals.original)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-medium text-foreground/40 uppercase tracking-wider">Aanpassing</p>
              <motion.p 
                key={totals.adjustment}
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
                className={cn(
                  "text-sm font-mono font-semibold",
                  totals.adjustment > 0 ? "text-success" : totals.adjustment < 0 ? "text-secondary" : "text-foreground/50"
                )}
              >
                {totals.adjustment >= 0 ? '+' : ''}{formatCurrency(totals.adjustment)}
              </motion.p>
            </div>
            <div className="w-px h-8 bg-foreground/10" />
            <div className="text-right">
              <p className="text-[9px] font-medium text-primary uppercase tracking-wider">Genormaliseerd</p>
              <motion.p 
                key={totals.normalized}
                initial={{ opacity: 0.5, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="text-lg font-mono font-bold text-foreground tracking-tight"
              >
                {formatCurrency(totals.normalized)}
              </motion.p>
            </div>
          </div>
        </div>

        {/* Prompt Input Area - Compact */}
        <div ref={inputContainerRef} className="px-6 py-4 border-b border-foreground/[0.06] relative">
          {/* Main Input Container - Enhanced glassmorphism with glow focus */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "relative rounded-2xl",
              "bg-gradient-to-br from-foreground/[0.04] to-foreground/[0.02]",
              "backdrop-blur-sm",
              "border border-foreground/[0.08]",
              "transition-all duration-300",
              "focus-within:border-primary/50 focus-within:shadow-[0_0_30px_-5px_hsl(var(--primary)/0.15)]"
            )}
          >
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
            />
            
            {/* Input Row */}
            <div className="flex items-center gap-3 px-4 py-3">
              <Search className="w-4 h-4 text-foreground/40 flex-shrink-0" />
              <input
                type="text"
                placeholder={showAddForm 
                  ? "Zoek een andere grootboekcode..." 
                  : normalizations.length > 0 
                    ? "Zoek in normalisaties of voeg nieuwe toe..." 
                    : "Typ een grootboekcode (bijv. 620) of kies hieronder..."
                }
                value={searchQuery}
                onChange={(e) => {
                  const newQuery = e.target.value;
                  setSearchQuery(newQuery);
                  // Only show dropdown when user types something
                  if (newQuery.trim()) {
                    setShowLedgerDropdown(true);
                  } else {
                    setShowLedgerDropdown(false);
                  }
                  // Clear selected ledger when typing (allows changing it in edit mode)
                  if (selectedLedger && newQuery !== `${selectedLedger.code} · ${selectedLedger.name}`) {
                    setSelectedLedger(null);
                    // Don't clear values when editing - keep them for the new ledger selection
                    if (!editingId) {
                      setNewValue('');
                      setNewReason('');
                    }
                  }
                }}
                // Intentionally DO NOT open dropdown on focus (only on typing)
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim()) {
                    e.preventDefault();
                    handlePromptSubmit(searchQuery);
                  }
                }}
                className={cn(
                  "flex-1 bg-transparent border-none outline-none",
                  "text-sm text-foreground placeholder:text-foreground/35",
                  "min-w-0"
                )}
              />
              
              {/* Upload Button - only action needed */}
              <motion.button
                ref={uploadButtonRef}
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleUploadClick}
                className={cn(
                  "p-2 rounded-lg flex items-center gap-1.5",
                  "text-foreground/50 hover:text-foreground/70",
                  "bg-foreground/[0.04] hover:bg-foreground/[0.08]",
                  "border border-foreground/[0.06]",
                  "transition-all duration-200"
                )}
                title="Importeer grootboek"
              >
                <Upload className="w-4 h-4" />
              </motion.button>
              
              {/* Import Source Picker Popup - Rendered via Portal with standardized z-index */}
              {showImportPicker && createPortal(
                <div className="fixed inset-0 z-[11000] pointer-events-none">
                  {/* Backdrop to close popup */}
                  <button
                    type="button"
                    aria-label="Sluit import picker"
                    className="absolute inset-0 pointer-events-auto bg-transparent"
                    onClick={() => setShowImportPicker(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    className="absolute z-[11001] pointer-events-auto w-64 p-1.5 bg-background border border-foreground/10 rounded-xl shadow-2xl"
                    style={{
                      top: uploadButtonRect ? uploadButtonRect.bottom + 8 : 0,
                      left: uploadButtonRect ? Math.max(16, uploadButtonRect.right - 256) : 0,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-2.5 py-1.5 mb-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/40">
                        Kies bron
                      </span>
                    </div>
                    <button
                      onClick={() => handleImportSourceSelect('yuki')}
                      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-foreground/[0.04] transition-colors min-h-[48px]"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-primary">Y</span>
                      </div>
                      <div className="text-left min-w-0">
                        <p className="text-sm font-medium text-foreground">Yuki</p>
                        <p className="text-[10px] text-foreground/40">Grootboekexport</p>
                      </div>
                    </button>
                    <button
                      onClick={() => handleImportSourceSelect('exact')}
                      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-foreground/[0.04] transition-colors min-h-[48px]"
                    >
                      <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-accent-foreground">E</span>
                      </div>
                      <div className="text-left min-w-0">
                        <p className="text-sm font-medium text-foreground">Exact Online</p>
                        <p className="text-[10px] text-foreground/40">Proefbalans export</p>
                      </div>
                    </button>
                    <div className="h-px bg-foreground/[0.06] my-0.5" />
                    <button
                      onClick={() => handleImportSourceSelect('custom')}
                      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-foreground/[0.04] transition-colors min-h-[48px]"
                    >
                      <div className="w-8 h-8 rounded-lg bg-foreground/[0.06] flex items-center justify-center flex-shrink-0">
                        <FileSpreadsheet className="w-4 h-4 text-foreground/50" />
                      </div>
                      <div className="text-left min-w-0">
                        <p className="text-sm font-medium text-foreground">Ander bestand</p>
                        <p className="text-[10px] text-foreground/40">CSV of Excel</p>
                      </div>
                    </button>
                  </motion.div>
                </div>,
                document.body
              )}
            </div>
            
            {/* Suggestion Pills Row - Hidden when add form is visible */}
            <AnimatePresence>
              {!showAddForm && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="px-4 pb-4 pt-2"
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    {normalizationPresets.slice(0, 6).map((preset, index) => (
                      <motion.button
                        key={preset.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ 
                          delay: 0.05 * index,
                          type: "spring",
                          stiffness: 400,
                          damping: 25
                        }}
                        whileHover={{ y: -2, scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          setSelectedLedger({
                            code: preset.ledgerCode,
                            name: preset.ledgerName,
                          });
                          setSearchQuery(`${preset.ledgerCode} · ${preset.ledgerName}`);
                          setNewType(preset.defaultType);
                          setNewValue(preset.defaultValue.toString());
                          setNewReason(preset.description);
                          setShowAddForm(true);
                        }}
                        className={cn(
                          "inline-flex items-center px-4 py-2.5 rounded-xl",
                          "bg-gradient-to-br from-foreground/[0.04] to-foreground/[0.02]",
                          "border border-foreground/[0.08]",
                          "text-xs text-foreground/70 font-medium",
                          "hover:bg-gradient-to-br hover:from-foreground/[0.08] hover:to-foreground/[0.04]",
                          "hover:border-foreground/[0.15] hover:text-foreground",
                          "hover:shadow-md hover:shadow-foreground/[0.03]",
                          "transition-all duration-200"
                        )}
                      >
                        {preset.label}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Ledger dropdown - rendered via portal for proper z-index */}
            {showLedgerDropdown && !selectedLedger && searchQuery.trim().length > 0 && filteredLedgers.length > 0 && inputRect && createPortal(
              // NOTE: pointer-events are carefully managed to avoid the backdrop intercepting item clicks.
              <div className="fixed inset-0 z-[11000] pointer-events-none">
                {/* Backdrop to close dropdown */}
                <button
                  type="button"
                  aria-label="Sluit grootboek dropdown"
                  className="absolute inset-0 pointer-events-auto bg-transparent"
                  onClick={() => setShowLedgerDropdown(false)}
                />
                {/* Dropdown content - clickable, dense two-line layout */}
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="absolute z-[11001] pointer-events-auto py-1 bg-background border border-foreground/10 rounded-xl shadow-2xl max-h-[320px] overflow-y-auto"
                  style={{
                    top: inputRect.bottom + 4,
                    left: inputRect.left,
                    width: Math.max(inputRect.width, 320),
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-1.5 border-b border-foreground/[0.06] flex items-center justify-between sticky top-0 bg-background z-10">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/40">
                      Grootboekrekeningen
                    </span>
                    <span className="text-[10px] text-foreground/30 tabular-nums">
                      {filteredLedgers.length} gevonden
                    </span>
                  </div>
                  <div className="py-0.5">
                    {filteredLedgers.map((account, index) => {
                      // Type assertion for fuzzy match indices
                      const codeIndices = (account as any)._codeIndices || [];
                      const nameIndices = (account as any)._nameIndices || [];
                      
                      // Highlight matched characters in code
                      const renderHighlightedCode = () => {
                        if (codeIndices.length === 0) return account.code;
                        return account.code.split('').map((char, i) => (
                          <span key={i} className={codeIndices.includes(i) ? 'text-primary font-bold' : ''}>
                            {char}
                          </span>
                        ));
                      };
                      
                      // Highlight matched characters in name
                      const renderHighlightedName = () => {
                        if (nameIndices.length === 0) return account.name;
                        return account.name.split('').map((char, i) => (
                          <span key={i} className={nameIndices.includes(i) ? 'text-primary font-semibold' : ''}>
                            {char}
                          </span>
                        ));
                      };
                      
                      return (
                        <motion.button
                          key={account.code}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: Math.min(index * 0.015, 0.15) }}
                          onClick={() => {
                            setSelectedLedger(account);
                            setSearchQuery(`${account.code} · ${account.name}`);
                            setShowLedgerDropdown(false);
                            setShowAddForm(true);
                          }}
                          className={cn(
                            "w-full px-3 py-2 text-left hover:bg-primary/5 flex items-center gap-2.5 transition-colors group",
                            "min-h-[48px]" // 48px touch target for mobile
                          )}
                        >
                          {/* Code badge - compact */}
                          <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary font-bold min-w-[3rem] text-center group-hover:bg-primary/15 transition-colors flex-shrink-0">
                            {renderHighlightedCode()}
                          </span>
                          {/* Two-line content: name + category */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground/90 truncate leading-tight">
                              {renderHighlightedName()}
                            </p>
                            {account.category && (
                              <p className="text-[10px] text-foreground/40 truncate leading-tight mt-0.5">
                                {account.category}
                              </p>
                            )}
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                  {searchQuery && filteredLedgers.length === 0 && (
                    <div className="px-4 py-5 text-center">
                      <p className="text-sm text-foreground/50">Geen resultaten voor "{searchQuery}"</p>
                      <p className="text-[11px] text-foreground/30 mt-0.5">Probeer een andere zoekterm</p>
                    </div>
                  )}
                </motion.div>
              </div>,
              document.body
            )}
          </motion.div>
        </div>

        {/* Summary bar removed - now inline in header */}

        {/* Toolbar: Unified row with Tabs left, Filters right */}
        <div className="px-6 py-3 border-t border-foreground/[0.06] bg-muted/30">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Status Tabs - Using plain buttons with proper spacing */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-background/80 border border-foreground/[0.06]">
              {[
                { value: 'all', label: 'Alle', count: counts.all, icon: null, color: null },
                { value: 'pending', label: 'Te beoordelen', count: counts.pending, icon: Clock, color: 'warning' },
                { value: 'accepted', label: ca('accepted'), count: counts.accepted, icon: CheckCircle2, color: 'success' },
                { value: 'rejected', label: ca('rejected'), count: counts.rejected, icon: XCircle, color: 'secondary' },
              ].map(({ value, label, count, icon: Icon, color }) => (
                <button
                  key={value}
                  onClick={() => setActiveTab(value as typeof activeTab)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                    activeTab === value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground/60 hover:text-foreground hover:bg-foreground/[0.05]"
                  )}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  <span>{label}</span>
                  {count > 0 && (
                    <span className={cn(
                      "ml-0.5 min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center rounded-md text-[10px] font-bold tabular-nums",
                      activeTab === value
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : color === 'warning' ? "bg-warning/10 text-warning"
                        : color === 'success' ? "bg-success/15 text-success"
                        : color === 'secondary' ? "bg-secondary/15 text-secondary"
                        : "bg-foreground/[0.08] text-foreground/60"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>
            
            {/* Right: Year Filter + View Mode Toggle (with visual separator) */}
            <div className="flex items-center gap-3">
              {/* Year Filter Pills - hide when only 1 year in data */}
              {yearsInData.length > 1 && (
              <div className="flex items-center gap-1 p-1 rounded-xl bg-background/80 border border-foreground/[0.06]">
                <button
                  onClick={() => setYearFilter(null)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
                    yearFilter === null
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground/60 hover:text-foreground hover:bg-foreground/[0.05]"
                  )}
                >
                  Alle
                </button>
                {yearsInData.slice(0, 4).map((year) => (
                  <button
                    key={year}
                    onClick={() => setYearFilter(yearFilter === year ? null : year)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all tabular-nums",
                      yearFilter === year
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-foreground/60 hover:text-foreground hover:bg-foreground/[0.05]"
                    )}
                  >
                    {year}
                  </button>
                ))}
              </div>
              )}
              
              {/* View Mode Toggle */}
              <div className="flex items-center gap-0.5 p-1 rounded-xl bg-background/80 border border-foreground/[0.06]">
                <TooltipProvider>
                  <TooltipRoot>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setViewMode('compact')}
                        className={cn(
                          "p-1.5 rounded-lg transition-all",
                          viewMode === 'compact'
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.05]"
                        )}
                      >
                        <LayoutList className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-[10px]">Compact</TooltipContent>
                  </TooltipRoot>
                </TooltipProvider>
                <TooltipProvider>
                  <TooltipRoot>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setViewMode('financial')}
                        className={cn(
                          "p-1.5 rounded-lg transition-all",
                          viewMode === 'financial'
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.05]"
                        )}
                      >
                        <Table2 className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-[10px]">Financiële tabel</TooltipContent>
                  </TooltipRoot>
                </TooltipProvider>
                <TooltipProvider>
                  <TooltipRoot>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setViewMode('bento')}
                        className={cn(
                          "p-1.5 rounded-lg transition-all",
                          viewMode === 'bento'
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.05]"
                        )}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-[10px]">Bento Grid</TooltipContent>
                  </TooltipRoot>
                </TooltipProvider>
              </div>
            </div>
          </div>
        </div>

        {/* Bulk Actions Bar */}
        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-6 pb-3"
            >
              <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-foreground/70">
                    {selectedIds.size} geselecteerd
                  </span>
                  <button
                    onClick={deselectAll}
                    className="text-xs text-foreground/50 hover:text-foreground/70 underline"
                  >
                    Deselecteer
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => bulkUpdateStatus('rejected')}
                    className="text-xs h-8 px-3 text-secondary hover:text-secondary hover:bg-secondary/10"
                  >
                    <X className="w-3.5 h-3.5 mr-1.5" />
                    {ca('reject')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => bulkUpdateStatus('accepted')}
                    className="text-xs h-8 px-3 text-success hover:text-success hover:bg-success/10"
                  >
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                    {ca('accept')}
                  </Button>
                  <div className="w-px h-6 bg-foreground/10" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={bulkDelete}
                    className="text-xs h-8 px-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Verwijderen
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        <div 
          ref={listContainerRef}
          className="flex-1 overflow-y-auto px-6 pb-6"
        >
          {/* Bulk Actions for Pending - only show if no selection */}
          {activeTab === 'pending' && counts.pending > 0 && selectedIds.size === 0 && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-warning/5 border border-warning/10 mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-warning" />
                <span className="text-xs font-medium text-foreground/70">
                  {counts.pending} suggestie{counts.pending > 1 ? 's' : ''} te beoordelen
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={rejectAll}
                  className="text-xs h-7 px-2 text-secondary hover:text-secondary hover:bg-secondary/10"
                >
                  <X className="w-3 h-3 mr-1" />
                  Alles afwijzen
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={acceptAll}
                  className="text-xs h-7 px-2 text-success hover:text-success hover:bg-success/10"
                >
                  <Check className="w-3 h-3 mr-1" />
                  Alles accepteren
                </Button>
              </div>
            </div>
          )}

          {/* Inline Add Form - Appears FIRST when adding for immediate visibility */}
          <AnimatePresence>
            {showAddForm && (
              <motion.div
                ref={addFormRef}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="p-4 rounded-xl bg-primary/[0.03] border border-primary/20 mb-4"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Plus className="w-4 h-4 text-primary" />
                    {nh('addNormalization')}
                  </span>
                  <button
                    onClick={() => {
                      setShowAddForm(false);
                      setSelectedLedger(null);
                      setSearchQuery('');
                      setNewValue('');
                      setNewReason('');
                    }}
                    className="p-1.5 rounded-lg hover:bg-foreground/10 text-foreground/40 hover:text-foreground/60 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Selected Ledger Pill - Clickable to change */}
                {selectedLedger && (
                  <div className="mb-4">
                    <label className="text-xs font-medium text-foreground/60 mb-1.5 block">Grootboekrekening</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          // Clear selection to show search input and allow re-selection
                          setSelectedLedger(null);
                          setSearchQuery('');
                        }}
                        className="flex-1 flex items-center gap-3 p-2.5 rounded-lg bg-background/80 border border-foreground/[0.08] hover:border-primary/30 hover:bg-primary/[0.02] transition-all group text-left"
                      >
                        <span className="font-mono text-xs px-2 py-1 rounded-md bg-primary/10 text-primary font-bold group-hover:bg-primary/15 transition-colors">
                          {selectedLedger.code}
                        </span>
                        <span className="text-sm text-foreground flex-1 truncate">
                          {selectedLedger.name}
                        </span>
                        <span className="text-[10px] text-foreground/40 group-hover:text-primary transition-colors flex items-center gap-1">
                          <Edit3 className="w-3 h-3" />
                          Wijzig
                        </span>
                      </button>
                    </div>
                    <p className="text-[10px] text-foreground/40 mt-1">Klik om een andere grootboekrekening te kiezen</p>
                  </div>
                )}

                {/* Inline form row */}
                <div className="flex flex-wrap gap-3 items-end">
                  {/* Type Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground/60">Type</label>
                    <div className="flex gap-1">
                      {typeOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setNewType(option.value)}
                          className={cn(
                            "px-3 py-2 rounded-lg text-xs font-medium transition-all",
                            newType === option.value
                              ? "bg-primary text-primary-foreground"
                              : "bg-foreground/[0.04] text-foreground/60 hover:bg-foreground/[0.08]"
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Value Input with label */}
                  <div className="flex-1 min-w-[140px]">
                    <Input
                      label={newType.includes('percent') ? 'Percentage' : 'Bedrag'}
                      type="text"
                      placeholder={newType.includes('percent') ? '10' : '60.000'}
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      leftIcon={
                        <span className="text-foreground/40 text-sm font-medium">
                          {newType.includes('percent') ? '%' : '€'}
                        </span>
                      }
                      size="sm"
                    />
                  </div>

                  {/* Year Scope Selection - Individual year buttons */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground/60">Toepassen op</label>
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-foreground/[0.03]">
                      {availableYears.map((year) => (
                        <button
                          key={year}
                          type="button"
                          onClick={() => {
                            if (newSelectedYears.includes(year)) {
                              if (newSelectedYears.length > 1) {
                                setNewSelectedYears(newSelectedYears.filter(y => y !== year));
                              }
                            } else {
                              setNewSelectedYears([...newSelectedYears, year].sort((a, b) => b - a));
                            }
                          }}
                          className={cn(
                            "px-2.5 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                            newSelectedYears.includes(year)
                              ? "bg-primary text-primary-foreground"
                              : "text-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.04]"
                          )}
                        >
                          {year}
                        </button>
                      ))}
                      <div className="w-px h-6 bg-foreground/10 mx-1" />
                      <button
                        type="button"
                        onClick={() => setNewSelectedYears([...availableYears])}
                        className={cn(
                          "px-2.5 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                          newSelectedYears.length === availableYears.length
                            ? "bg-primary text-primary-foreground"
                            : "text-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.04]"
                        )}
                      >
                        Alle
                      </button>
                    </div>
                  </div>

                  {/* Add Button */}
                  <Button
                    onClick={addNormalization}
                    disabled={!newValue || !selectedLedger}
                    size="sm"
                    className="gap-1.5 h-10 self-end"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {editingId ? 'Opslaan' : 'Toevoegen'}
                  </Button>
                  
                  {/* Cancel button when editing */}
                  {editingId && (
                    <Button
                      onClick={cancelEditing}
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 h-10 self-end"
                    >
                      <X className="w-3.5 h-3.5" />
                      Annuleren
                    </Button>
                  )}
                </div>

                {/* Percentage Preview: Original → Outcome */}
                {(newType === 'add_percent' || newType === 'subtract_percent') && newValue && (
                  <div className="mt-4 p-3 rounded-lg bg-foreground/[0.02] border border-foreground/[0.06]">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-[9px] font-medium text-foreground/40 uppercase tracking-wider mb-0.5">{nh('originalEbitda')}</p>
                        <p className="text-sm font-mono font-medium text-foreground/60">{formatCurrency(originalEBITDA)}</p>
                      </div>
                      <div className="text-foreground/30">→</div>
                      <div>
                        <p className="text-[9px] font-medium text-foreground/40 uppercase tracking-wider mb-0.5">Aanpassing</p>
                        <p className={cn(
                          "text-sm font-mono font-semibold",
                          newType === 'add_percent' ? "text-success" : "text-secondary"
                        )}>
                          {newType === 'add_percent' ? '+' : '-'}{formatCurrency(Math.abs(originalEBITDA * (parseFloat(newValue.replace(/[^0-9.-]/g, '')) || 0) / 100))}
                        </p>
                      </div>
                      <div className="text-foreground/30">→</div>
                      <div>
                        <p className="text-[9px] font-medium text-primary uppercase tracking-wider mb-0.5">Uitkomst</p>
                        <p className="text-sm font-mono font-bold text-foreground">
                          {formatCurrency(
                            originalEBITDA + (newType === 'add_percent' ? 1 : -1) * originalEBITDA * (parseFloat(newValue.replace(/[^0-9.-]/g, '')) || 0) / 100
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Reason Input with label */}
                <div className="mt-4">
                  <Input
                    label="Toelichting"
                    placeholder="Beschrijf de reden voor deze normalisatie (optioneel)"
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                    size="sm"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* View Mode Content */}
          {viewMode === 'financial' ? (
            /* Professional Financial Table View */
            <NormalizationTableView
              items={filteredNormalizations}
              years={availableYears}
              originalEBITDA={originalEBITDA}
              onAccept={(id) => updateStatus(id, 'accepted')}
              onReject={(id) => updateStatus(id, 'rejected')}
              onRemove={removeNormalization}
              onRestore={(id) => updateStatus(id, 'pending')}
              onEdit={(item) => startEditing(item)}
            />
          ) : viewMode === 'bento' ? (
            /* Premium Bento Grid View */
            <NormalizationBentoView
              items={filteredNormalizations}
              years={availableYears}
              originalEBITDA={originalEBITDA}
              onAccept={(id) => updateStatus(id, 'accepted')}
              onReject={(id) => updateStatus(id, 'rejected')}
              onRemove={removeNormalization}
              onRestore={(id) => updateStatus(id, 'pending')}
              onEdit={(item) => startEditing(item)}
            />
          ) : (
            /* Compact Table View (Original) */
            <>
              {/* Table Header for compact mode - only show when not using year groups or when a year filter is active */}
              {filteredNormalizations.length > 0 && yearFilter !== null && (
                <div className="flex items-center gap-3 px-3 py-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/40 border-b border-foreground/[0.06]">
                  {/* Checkbox column */}
                  <div className="w-6 flex-shrink-0">
                    <button
                      onClick={() => isAllSelected ? deselectAll() : selectAll()}
                      className="p-0.5 rounded hover:bg-foreground/10 transition-colors"
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : isSomeSelected ? (
                        <MinusSquare className="w-4 h-4 text-primary/60" />
                      ) : (
                        <Square className="w-4 h-4 text-foreground/30" />
                      )}
                    </button>
                  </div>
                  <div className="w-16 flex-shrink-0">Code</div>
                  <div className="flex-1 min-w-0">Omschrijving</div>
                  <div className="w-20 flex-shrink-0 text-center">Jaar</div>
                  <div className="w-16 flex-shrink-0 text-center">Bron</div>
                  <div className="w-20 flex-shrink-0 text-center">Status</div>
                  <div className="w-28 flex-shrink-0 text-right">Bedrag</div>
                  <div className="w-24 flex-shrink-0 text-right">Acties</div>
                </div>
              )}

              {/* Year-Grouped Collapsible Sections */}
              {filteredNormalizations.length > 0 ? (
                <div className="space-y-3">
                  {groupedByYear.map(({ year, items }) => {
                    const isCollapsed = collapsedYears.has(year);
                    const yearTotal = items
                      .filter(n => n.status === 'accepted')
                      .reduce((sum, n) => sum + n.adjustment, 0);
                    
                    return (
                      <div key={year} className="rounded-xl border border-foreground/[0.06] overflow-hidden">
                        {/* Year Header - Collapsible */}
                        <button
                          onClick={() => toggleYearCollapse(year)}
                          className={cn(
                            "w-full flex items-center justify-between px-4 py-3",
                            "bg-foreground/[0.02] hover:bg-foreground/[0.04]",
                            "transition-colors"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <motion.div
                              animate={{ rotate: isCollapsed ? -90 : 0 }}
                              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            >
                              <ChevronDown className="w-4 h-4 text-foreground/40" />
                            </motion.div>
                            <span className="text-sm font-semibold text-foreground tabular-nums">
                              {year}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-foreground/[0.06] text-foreground/50">
                              {items.length} {items.length === 1 ? 'item' : 'items'}
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className={cn(
                              "text-sm font-mono font-semibold tabular-nums",
                              yearTotal >= 0 ? "text-success" : "text-secondary"
                            )}>
                              {yearTotal >= 0 ? '+' : ''}{formatCurrency(yearTotal)}
                            </span>
                          </div>
                        </button>
                        
                        {/* Collapsible Content */}
                        <AnimatePresence initial={false}>
                          {!isCollapsed && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            >
                              {/* Table header inside group for compact mode */}
                              <div className="flex items-center gap-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-foreground/40 border-t border-b border-foreground/[0.06] bg-foreground/[0.01]">
                                <div className="w-6 flex-shrink-0" />
                                <div className="w-16 flex-shrink-0">Code</div>
                                <div className="flex-1 min-w-0">Omschrijving</div>
                                <div className="w-16 flex-shrink-0 text-center">Bron</div>
                                <div className="w-20 flex-shrink-0 text-center">Status</div>
                                <div className="w-28 flex-shrink-0 text-right">Bedrag</div>
                                <div className="w-24 flex-shrink-0 text-right">Acties</div>
                              </div>
                              
                              {/* Items */}
                              <div>
                                {items.map((item) => {
                                  const isSelected = selectedIds.has(item.id);
                                  
                                  return (
                                    <CompactTableRow
                                      key={item.id}
                                      item={item}
                                      isSelected={isSelected}
                                      onToggleSelect={() => toggleSelect(item.id)}
                                      onAccept={() => updateStatus(item.id, 'accepted')}
                                      onReject={() => updateStatus(item.id, 'rejected')}
                                      onRemove={() => removeNormalization(item.id)}
                                      onRestore={() => updateStatus(item.id, 'pending')}
                                      onEdit={() => startEditing(item)}
                                      hideYear
                                    />
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="py-20 text-center"
                >
                  {/* Elegant floating illustration */}
                  <motion.div 
                    className="relative w-24 h-24 mx-auto mb-8"
                    animate={{ y: [0, -6, 0] }}
                    transition={{ 
                      duration: 4, 
                      repeat: Infinity, 
                      ease: "easeInOut" 
                    }}
                  >
                    {/* Outer glow ring */}
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/10 via-primary/5 to-transparent blur-sm" />
                    {/* Background circle */}
                    <div className="absolute inset-1 rounded-full bg-gradient-to-br from-primary/8 to-primary/4" />
                    {/* Inner icon container */}
                    <div className="absolute inset-3 rounded-full bg-background/90 backdrop-blur-sm border border-foreground/[0.08] shadow-sm flex items-center justify-center">
                      {activeTab === 'pending' ? (
                        <CheckCircle2 className="w-8 h-8 text-success/70" />
                      ) : activeTab === 'rejected' ? (
                        <XCircle className="w-8 h-8 text-foreground/30" />
                      ) : activeTab === 'accepted' ? (
                        <CheckCircle2 className="w-8 h-8 text-foreground/30" />
                      ) : (
                        <PenLine className="w-8 h-8 text-foreground/30" />
                      )}
                    </div>
                  </motion.div>
                  
                  {/* Title */}
                  <p className="text-lg font-medium text-foreground/80 mb-2">
                    {activeTab === 'pending' && 'Alle suggesties beoordeeld'}
                    {activeTab === 'accepted' && 'Nog geen normalisaties geaccepteerd'}
                    {activeTab === 'rejected' && 'Geen afgewezen normalisaties'}
                    {activeTab === 'all' && 'Nog geen normalisaties'}
                  </p>
                  
                  {/* Helpful subtext */}
                  <p className="text-sm text-foreground/45 max-w-sm mx-auto leading-relaxed">
                    {activeTab === 'pending' && 'Goed bezig! Alle AI-suggesties zijn verwerkt.'}
                    {activeTab === 'accepted' && 'Accepteer suggesties of voeg handmatig normalisaties toe via de zoekbalk hierboven.'}
                    {activeTab === 'rejected' && nh('rejectedEmptyState')}
                    {activeTab === 'all' && 'Gebruik de zoekbalk of klik op een snelkeuze hierboven om een normalisatie toe te voegen.'}
                  </p>
                </motion.div>
              )}
            </>
          )}
          
          {/* Empty state for financial and bento views */}
          {(viewMode === 'financial' || viewMode === 'bento') && filteredNormalizations.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="py-20 text-center"
            >
              <motion.div 
                className="relative w-24 h-24 mx-auto mb-8"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/10 via-primary/5 to-transparent blur-sm" />
                <div className="absolute inset-1 rounded-full bg-gradient-to-br from-primary/8 to-primary/4" />
                <div className="absolute inset-3 rounded-full bg-background/90 backdrop-blur-sm border border-foreground/[0.08] shadow-sm flex items-center justify-center">
                  <PenLine className="w-8 h-8 text-foreground/30" />
                </div>
              </motion.div>
              <p className="text-lg font-medium text-foreground/80 mb-2">
                Nog geen normalisaties
              </p>
              <p className="text-sm text-foreground/45 max-w-sm mx-auto leading-relaxed">
                Gebruik de zoekbalk of klik op een snelkeuze hierboven om een normalisatie toe te voegen.
              </p>
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <ModalFooter className="border-t border-foreground/[0.06] px-6 py-4">
          <div className="flex items-center justify-between w-full">
            <p className="text-xs text-foreground/50">
              {filteredNormalizations.length} van {normalizations.length} normalisaties
              {yearFilter && ` · Filter: ${yearFilter}`}
            </p>
            <Button onClick={() => onOpenChange(false)}>
              {tCommon('close')}
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}


// ─────────────────────────────────────────
// COMPACT TABLE ROW COMPONENT
// ─────────────────────────────────────────

interface CompactTableRowProps {
  item: NormalizationItem;
  isSelected: boolean;
  onToggleSelect: () => void;
  onAccept: () => void;
  onReject: () => void;
  onRemove: () => void;
  onRestore: () => void;
  onEdit: () => void;
  hideYear?: boolean;
}

function CompactTableRow({
  item,
  isSelected,
  onToggleSelect,
  onAccept,
  onReject,
  onRemove,
  onRestore,
  onEdit,
  hideYear = false,
}: CompactTableRowProps) {
  const ca = useTranslations('chatAssistant');
  const nh = useTranslations('normalizationHub');
  const tCommon = useTranslations('common.actions');
  const category = categoryConfig[item.category] || categoryConfig.other;
  const source = sourceConfig[item.source] || sourceConfig.manual;

  // Year display
  const yearDisplay = item.applyAllYears 
    ? 'Alle' 
    : item.applyYears && item.applyYears.length > 0
      ? item.applyYears.length === 1 
        ? item.applyYears[0].toString()
        : `${item.applyYears.length} jr`
      : item.year.toString();

  return (
    <div 
      className={cn(
        "flex items-center gap-3 px-3 h-12 rounded-lg transition-colors group",
        "hover:bg-foreground/[0.02]",
        item.status === 'accepted' && "bg-success/[0.02]",
        item.status === 'rejected' && "bg-secondary/[0.02] opacity-60",
        isSelected && "bg-primary/[0.05] hover:bg-primary/[0.08]"
      )}
    >
      {/* Checkbox */}
      <div className="w-6 flex-shrink-0">
        <button
          onClick={onToggleSelect}
          className="p-0.5 rounded hover:bg-foreground/10 transition-colors"
        >
          {isSelected ? (
            <CheckSquare className="w-4 h-4 text-primary" />
          ) : (
            <Square className="w-4 h-4 text-foreground/30 group-hover:text-foreground/50" />
          )}
        </button>
      </div>

      {/* Code */}
      <div className="w-16 flex-shrink-0">
        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-foreground/[0.06] text-foreground/60">
          {item.ledgerCode}
        </span>
      </div>

      {/* Name + Reason */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm text-foreground/80 truncate">
          {item.ledgerName}
        </span>
        {item.reason && (
          <span className="text-xs text-foreground/40 truncate hidden lg:inline">
            · {item.reason}
          </span>
        )}
      </div>

      {/* Year - conditionally hidden when grouped by year */}
      {!hideYear && (
        <div className="w-20 flex-shrink-0 text-center">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-foreground/[0.06] text-foreground/50 tabular-nums">
            <Calendar className="w-2.5 h-2.5" />
            {yearDisplay}
          </span>
        </div>
      )}

      {/* Source */}
      <div className="w-16 flex-shrink-0 text-center">
        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", source.color)}>
          {source.label === 'AI Suggestie' ? 'AI' : source.label}
        </span>
      </div>

      {/* Status */}
      <div className="w-20 flex-shrink-0 text-center">
        {item.status === 'pending' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-warning/10 text-warning">
            <Clock className="w-2.5 h-2.5" />
            Pending
          </span>
        )}
        {item.status === 'accepted' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/10 text-success">
            <Check className="w-2.5 h-2.5" />
            OK
          </span>
        )}
        {item.status === 'rejected' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary/10 text-secondary">
            <X className="w-2.5 h-2.5" />
            {nh('no')}
          </span>
        )}
      </div>

      {/* Amount */}
      <div className="w-28 flex-shrink-0 text-right">
        <span className={cn(
          "text-sm font-mono font-semibold tabular-nums",
          item.adjustment >= 0 ? "text-success" : "text-secondary"
        )}>
          {item.adjustment >= 0 ? '+' : ''}{formatCurrency(item.adjustment)}
        </span>
      </div>

      {/* Actions */}
      <div className="w-24 flex-shrink-0 flex items-center justify-end gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        {item.status === 'pending' && (
          <>
            <TooltipProvider>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <button
                    onClick={onEdit}
                    className="p-1.5 rounded-md text-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{tCommon('edit')}</TooltipContent>
              </TooltipRoot>
            </TooltipProvider>
            <TooltipProvider>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <button
                    onClick={onReject}
                    className="p-1.5 rounded-md text-foreground/40 hover:text-secondary hover:bg-secondary/10 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{ca('reject')}</TooltipContent>
              </TooltipRoot>
            </TooltipProvider>
            <TooltipProvider>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <button
                    onClick={onAccept}
                    className="p-1.5 rounded-md text-foreground/40 hover:text-success hover:bg-success/10 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{ca('accept')}</TooltipContent>
              </TooltipRoot>
            </TooltipProvider>
          </>
        )}

        {item.status === 'accepted' && (
          <>
            <TooltipProvider>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <button
                    onClick={onEdit}
                    className="p-1.5 rounded-md text-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{tCommon('edit')}</TooltipContent>
              </TooltipRoot>
            </TooltipProvider>
            {item.source === 'manual' && (
              <TooltipProvider>
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <button
                      onClick={onRemove}
                      className="p-1.5 rounded-md text-foreground/40 hover:text-secondary hover:bg-secondary/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{tCommon('delete')}</TooltipContent>
                </TooltipRoot>
              </TooltipProvider>
            )}
          </>
        )}

        {item.status === 'rejected' && (
          <TooltipProvider>
            <TooltipRoot>
              <TooltipTrigger asChild>
                <button
                  onClick={onRestore}
                  className="p-1.5 rounded-md text-foreground/40 hover:text-foreground/70 hover:bg-foreground/10 transition-colors"
                >
                  <Clock className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Opnieuw beoordelen</TooltipContent>
            </TooltipRoot>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────
// CARD ROW COMPONENT (Original design)
// ─────────────────────────────────────────

interface NormalizationRowProps {
  item: NormalizationItem;
  isEditing: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  editType: NormalizationType;
  editValue: string;
  editReason: string;
  editSelectedYears: number[];
  availableYears: number[];
  onEditTypeChange: (type: NormalizationType) => void;
  onEditValueChange: (value: string) => void;
  onEditReasonChange: (reason: string) => void;
  onEditSelectedYearsChange: (years: number[]) => void;
  onAccept: () => void;
  onReject: () => void;
  onRemove: () => void;
  onRestore: () => void;
  onEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  typeOptions: typeof typeOptions;
}

function NormalizationRow({
  item,
  isEditing,
  isSelected,
  onToggleSelect,
  editType,
  editValue,
  editReason,
  editSelectedYears,
  availableYears,
  onEditTypeChange,
  onEditValueChange,
  onEditReasonChange,
  onEditSelectedYearsChange,
  onAccept,
  onReject,
  onRemove,
  onRestore,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  typeOptions,
}: NormalizationRowProps) {
  const ca = useTranslations('chatAssistant');
  const nh = useTranslations('normalizationHub');
  const tCommon = useTranslations('common.actions');
  const category = categoryConfig[item.category] || categoryConfig.other;
  const source = sourceConfig[item.source] || sourceConfig.manual;

  if (isEditing) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="p-4 rounded-xl border-2 border-primary/30 bg-primary/[0.02] space-y-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-lg">
              {category.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-foreground/[0.06] text-foreground/50">
                  {item.ledgerCode}
                </span>
                <span className="text-sm font-medium text-foreground/80">
                  {item.ledgerName}
                </span>
              </div>
              <span className={cn("text-[10px] font-medium", source.color)}>
                {source.label}
              </span>
            </div>
          </div>
          <button
            onClick={onCancelEdit}
            className="p-1.5 rounded-lg hover:bg-foreground/10 text-foreground/40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Type & Value Row */}
        <div className="flex gap-3 items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/60">Type</label>
            <div className="flex gap-1">
              {typeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onEditTypeChange(option.value)}
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
          </div>
          <div className="flex-1">
            <Input
              label={editType.includes('percent') ? 'Percentage' : 'Bedrag'}
              type="text"
              placeholder="Bedrag"
              value={editValue}
              onChange={(e) => onEditValueChange(e.target.value)}
              leftIcon={
                <span className="text-foreground/40 text-sm font-medium">
                  {editType.includes('percent') ? '%' : '€'}
                </span>
              }
              size="sm"
              autoFocus
            />
          </div>
        </div>

        {/* Year Scope Selection - Individual year buttons */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground/60">Toepassen op</label>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-foreground/[0.03] w-fit">
            {availableYears.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => {
                  if (editSelectedYears.includes(year)) {
                    // Don't allow deselecting if it's the only selected year
                    if (editSelectedYears.length > 1) {
                      onEditSelectedYearsChange(editSelectedYears.filter(y => y !== year));
                    }
                  } else {
                    onEditSelectedYearsChange([...editSelectedYears, year].sort((a, b) => b - a));
                  }
                }}
                className={cn(
                  "px-2.5 py-2 rounded-md text-xs font-medium transition-all flex items-center gap-1.5",
                  editSelectedYears.includes(year)
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.04]"
                )}
              >
                {year}
              </button>
            ))}
            <div className="w-px h-6 bg-foreground/10 mx-1" />
            <button
              type="button"
              onClick={() => onEditSelectedYearsChange([...availableYears])}
              className={cn(
                "px-2.5 py-2 rounded-md text-xs font-medium transition-all flex items-center gap-1.5",
                editSelectedYears.length === availableYears.length
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/50 hover:text-foreground/70 hover:bg-foreground/[0.04]"
              )}
            >
              <CalendarRange className="w-3 h-3" />
              Alle
            </button>
          </div>
        </div>

        {/* Reason with label */}
        <Input
          label="Toelichting"
          placeholder="Beschrijf de reden voor deze aanpassing (optioneel)"
          value={editReason}
          onChange={(e) => onEditReasonChange(e.target.value)}
          size="sm"
        />

        {/* Action Buttons */}
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancelEdit}>
            Annuleren
          </Button>
          <Button size="sm" onClick={onSaveEdit} disabled={!editValue} className="gap-1.5">
            <Check className="w-3.5 h-3.5" />
            Opslaan
          </Button>
        </div>
      </motion.div>
    );
  }

  // View mode
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "p-3 rounded-xl border transition-all group",
        item.status === 'pending' && "bg-foreground/[0.02] border-foreground/[0.08] hover:border-foreground/[0.12]",
        item.status === 'accepted' && "bg-success/[0.03] border-success/20",
        item.status === 'rejected' && "bg-secondary/[0.03] border-secondary/20 opacity-60",
        isSelected && "ring-2 ring-primary/30"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={onToggleSelect}
          className="p-0.5 rounded mt-1 hover:bg-foreground/10 transition-colors flex-shrink-0"
        >
          {isSelected ? (
            <CheckSquare className="w-4 h-4 text-primary" />
          ) : (
            <Square className="w-4 h-4 text-foreground/30 group-hover:text-foreground/50" />
          )}
        </button>

        {/* Icon */}
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center text-lg shrink-0",
          item.status === 'accepted' && "bg-success/10",
          item.status === 'rejected' && "bg-secondary/10",
          item.status === 'pending' && "bg-foreground/[0.04]"
        )}>
          {category.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-foreground/[0.06] text-foreground/50">
              {item.ledgerCode}
            </span>
            <span className="text-sm font-medium text-foreground/80 truncate">
              {item.ledgerName}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* Source Badge */}
            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", source.color)}>
              {source.label}
              {item.sourceRef && ` · ${item.sourceRef}`}
            </span>
            {/* Year Badge */}
            {item.applyYears && item.applyYears.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-foreground/[0.06] text-foreground/50">
                <Calendar className="w-2.5 h-2.5" />
                {item.applyAllYears 
                  ? 'Alle jaren' 
                  : item.applyYears.length === 1 
                    ? item.applyYears[0]
                    : item.applyYears.join(', ')
                }
              </span>
            )}
            {/* Status for accepted/rejected */}
            {item.status === 'accepted' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/10 text-success">
                <Check className="w-2.5 h-2.5" />
                {ca('accepted')}
              </span>
            )}
            {item.status === 'rejected' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary/10 text-secondary">
                <X className="w-2.5 h-2.5" />
                {ca('rejected')}
              </span>
            )}
          </div>
          {item.reason && (
            <p className="text-xs text-foreground/50 mt-1 truncate">
              {item.reason}
            </p>
          )}
        </div>

        {/* Value & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn(
            "text-sm font-mono font-semibold",
            item.adjustment >= 0 ? "text-success" : "text-secondary"
          )}>
            {item.adjustment >= 0 ? '+' : ''}{formatCurrency(item.adjustment)}
          </span>

          {item.status === 'pending' && (
            <div className="flex gap-1">
              <TooltipProvider>
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <button
                      onClick={onEdit}
                      className="p-1.5 rounded-lg text-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{tCommon('edit')}</TooltipContent>
                </TooltipRoot>
              </TooltipProvider>
              <TooltipProvider>
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <button
                      onClick={onReject}
                      className="p-1.5 rounded-lg text-foreground/40 hover:text-secondary hover:bg-secondary/10 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{ca('reject')}</TooltipContent>
                </TooltipRoot>
              </TooltipProvider>
              <TooltipProvider>
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <button
                      onClick={onAccept}
                      className="p-1.5 rounded-lg text-foreground/40 hover:text-success hover:bg-success/10 transition-colors"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{ca('accept')}</TooltipContent>
                </TooltipRoot>
              </TooltipProvider>
            </div>
          )}

          {item.status === 'accepted' && (
            <div className="flex gap-1">
              <TooltipProvider>
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <button
                      onClick={onEdit}
                      className="p-1.5 rounded-lg text-foreground/30 hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{tCommon('edit')}</TooltipContent>
                </TooltipRoot>
              </TooltipProvider>
              {item.source === 'manual' && (
                <TooltipProvider>
                  <TooltipRoot>
                    <TooltipTrigger asChild>
                      <button
                        onClick={onRemove}
                        className="p-1.5 rounded-lg text-foreground/30 hover:text-secondary hover:bg-secondary/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{tCommon('delete')}</TooltipContent>
                  </TooltipRoot>
                </TooltipProvider>
              )}
            </div>
          )}

          {item.status === 'rejected' && (
            <div className="flex gap-1">
              <TooltipProvider>
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <button
                      onClick={onRestore}
                      className="p-1.5 rounded-lg text-foreground/30 hover:text-foreground/60 hover:bg-foreground/10 transition-colors"
                    >
                      <Clock className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Opnieuw beoordelen</TooltipContent>
                </TooltipRoot>
              </TooltipProvider>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default UnifiedNormalizationModal;
