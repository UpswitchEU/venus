'use client';

/**
 * History Panel
 * 
 * World-class version history with visual timeline, 
 * compare feature, and restore capability.
 * Inspired by Figma/GitHub version control aesthetics.
 */

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVersionHistoryStore } from '../../store/useVersionHistoryStore';
import { 
  Clock, 
  FileText, 
  TrendingUp, 
  User, 
  ChevronRight,
  ChevronDown,
  RotateCcw,
  Check,
  Settings2,
  Calculator,
  Calendar,
  Loader2,
  ArrowLeftRight,
  GitCompare,
  CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/design-system/utils';
import { AuroraButton as Button, Checkbox } from '@/design-system';
import { VersionCompareModal, type HistoryVersion } from './VersionCompareModal';

// Re-export types
export type { HistoryVersion };

// Generic report type - works with both ValuationReportPanel and ValuationChat reports
export interface ReportLike {
  id?: string;
  companyName?: string;
  valuation?: number;
  ebitda?: number;
  multiple?: number;
}

export interface HistoryPanelProps {
  report: ReportLike | null;
  // Receives the full ValuationVersion from the store (not the stripped HistoryVersion)
  onVersionRestore?: (version: any) => void;
}

// ── Helper: derive version type from store data ──
function deriveVersionType(v: any): HistoryVersion['type'] {
  const label = (v.versionLabel || '').toLowerCase()
  if (label.includes('normalis')) return 'normalization'
  if (label.includes('methodo') || label.includes('multiple')) return 'methodology'
  if (label.includes('data') || label.includes('financ') || label.includes('jaarrekening')) return 'data_update'
  if (v.versionNumber === 1) return 'initial'
  return 'revision'
}

// ── Helper: derive changes from store version ──
function deriveChanges(v: any): HistoryVersion['changes'] {
  if (v.changesSummary) {
    const cs = v.changesSummary
    const changes: HistoryVersion['changes'] = []
    if (cs.fieldsChanged) {
      for (const field of cs.fieldsChanged.slice(0, 5)) {
        changes.push({ field, newValue: 'Gewijzigd' })
      }
    }
    return changes
  }
  return []
}

// Unified neutral styling for all version types (60/30/10 rule - reserve color for actions)
const typeConfig: Record<HistoryVersion['type'], { icon: typeof Clock; label: string }> = {
  initial: { icon: FileText, label: 'Initieel' },
  normalization: { icon: Settings2, label: 'Normalisatie' },
  data_update: { icon: Calculator, label: 'Data update' },
  methodology: { icon: TrendingUp, label: 'Methodologie' },
  revision: { icon: User, label: 'Revisie' },
};

const formatCurrency = (amount: number) => {
  if (amount >= 1000000) {
    return `€${(amount / 1000000).toFixed(2)}M`;
  }
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatTime = (date: Date) => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 1000 * 60) return 'Zojuist';
  if (diff < 1000 * 60 * 60) return `${Math.floor(diff / (1000 * 60))} min geleden`;
  if (diff < 1000 * 60 * 60 * 24) return `${Math.floor(diff / (1000 * 60 * 60))} uur geleden`;
  if (diff < 1000 * 60 * 60 * 24 * 7) return `${Math.floor(diff / (1000 * 60 * 60 * 24))} dagen geleden`;
  return date.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const formatDate = (date: Date) => {
  return date.toLocaleDateString('nl-BE', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// ─────────────────────────────────────────
// VISUAL TIMELINE COMPONENT
// ─────────────────────────────────────────

function VisualTimeline({ versions }: { versions: HistoryVersion[] }) {
  const firstVal = versions[0]?.valuation;
  const lastVal = versions[versions.length - 1]?.valuation;
  const totalChange = versions.length > 1 && firstVal && lastVal
    ? firstVal - lastVal
    : 0;
  const percentChange = lastVal && totalChange
    ? (totalChange / lastVal) * 100
    : 0;

  return (
    <div className="px-4 py-4 border-b border-foreground/[0.06] bg-gradient-to-r from-primary/[0.02] to-transparent">
      {/* Total Journey */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-foreground/40" />
          <span className="text-xs text-foreground/50">
            Waarderingsverloop
          </span>
        </div>
        {totalChange !== 0 && (
          <div className={cn(
            "flex items-center gap-1.5 text-xs font-medium",
            totalChange > 0 ? "text-success" : "text-secondary"
          )}>
            <TrendingUp className={cn("w-3.5 h-3.5", totalChange < 0 && "rotate-180")} />
            <span className="font-mono">
              {totalChange > 0 ? '+' : ''}{formatCurrency(totalChange)}
            </span>
            <span className="text-foreground/40">
              ({percentChange > 0 ? '+' : ''}{percentChange.toFixed(1)}%)
            </span>
          </div>
        )}
      </div>

      {/* Visual Track */}
      <div className="relative">
        {/* Track Line */}
        <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-1 bg-foreground/[0.08] rounded-full" />
        
        {/* Gradient Progress */}
        <motion.div 
          className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-foreground/20 via-primary/50 to-primary rounded-full origin-left"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ type: 'spring', stiffness: 170, damping: 26, mass: 1 }}
        />

        {/* Version Dots */}
        <div className="relative flex justify-between px-4 py-2">
          {[...versions].reverse().map((version, index) => {
            const isFirst = index === 0;
            const isLast = index === versions.length - 1;
            
            return (
              <div 
                key={version.id} 
                className="flex flex-col items-center"
              >
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: index * 0.1, type: 'spring', stiffness: 300 }}
                  className={cn(
                    "relative w-4 h-4 rounded-full border-2 transition-all",
                    version.isCurrent 
                      ? "bg-primary border-primary shadow-lg shadow-primary/30"
                      : "bg-background border-foreground/20 hover:border-foreground/40"
                  )}
                >
                  {version.isCurrent && (
                    <motion.div
                      className="absolute inset-0 rounded-full bg-primary/30"
                      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  )}
                </motion.div>
                
                {/* Label */}
                <span className={cn(
                  "text-[9px] mt-1.5 font-medium",
                  version.isCurrent ? "text-primary" : "text-foreground/40"
                )}>
                  v{version.version}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// VALUATION SUMMARY CARD
// ─────────────────────────────────────────

function ValuationSummaryCard({ version }: { version: HistoryVersion }) {
  if (!version.valuation) return null;
  
  return (
    <div className="rounded-xl overflow-hidden mb-4 bg-foreground/[0.04] border border-foreground/[0.08]">
      <div className="p-5">
        {/* Label */}
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 text-foreground/50">
          Indicatieve Ondernemingswaarde (EV)
        </p>
        
        {/* Main Value */}
        <div className="flex items-baseline gap-3 mb-4">
          <span className="text-2xl font-bold leading-none tracking-tight font-mono text-foreground">
            {formatCurrency(version.valuation)}
          </span>
          {version.isCurrent && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded text-primary bg-primary/10 border border-primary/20">
              HUIDIG
            </span>
          )}
        </div>
        
        {/* Range + Metrics Grid */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-foreground/[0.06]">
          {version.valuationLow && version.valuationHigh && (
            <div>
              <p className="text-[9px] font-medium uppercase tracking-wider mb-1 text-foreground/40">
                Bandbreedte
              </p>
              <p className="text-xs font-medium text-foreground/80 font-mono">
                {formatCurrency(version.valuationLow)} — {formatCurrency(version.valuationHigh)}
              </p>
            </div>
          )}
          {version.ebitda && (
            <div>
              <p className="text-[9px] font-medium uppercase tracking-wider mb-1 text-foreground/40">
                Genormaliseerde EBITDA
              </p>
              <p className="text-xs font-medium text-foreground/80 font-mono">
                {formatCurrency(version.ebitda)}
              </p>
            </div>
          )}
          {version.multiple && (
            <div>
              <p className="text-[9px] font-medium uppercase tracking-wider mb-1 text-foreground/40">
                Multiple
              </p>
              <p className="text-xs font-medium text-foreground/80 font-mono">
                {version.multiple.toFixed(2)}×
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────

export function HistoryPanel({ report, onVersionRestore }: HistoryPanelProps) {
  // ── Real version data from store ──
  const reportId = report?.id
  const storeVersions = useVersionHistoryStore((s) => reportId ? (s.versions[reportId] || []) : [])
  const fetchVersions = useVersionHistoryStore((s) => s.fetchVersions)
  const storeLoading = useVersionHistoryStore((s) => s.loading)
  const storeError = useVersionHistoryStore((s) => s.error)
  const activeVersionNumber = useVersionHistoryStore((s) => reportId ? s.activeVersions[reportId] : undefined)

  // Fetch versions on mount
  useEffect(() => {
    if (reportId) fetchVersions(reportId)
  }, [reportId, fetchVersions])

  // Map store versions to HistoryVersion format for display
  // No mock fallback — show real data or empty state
  const historyVersions: HistoryVersion[] = useMemo(() => {
    if (storeVersions.length === 0) return []

    return storeVersions
      .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0))
      .map((v) => ({
        id: v.id || String(v.versionNumber),
        version: v.versionNumber || 1,
        timestamp: v.createdAt ? new Date(v.createdAt) : new Date(),
        author: (v as any).createdBy || 'Gebruiker',
        authorInitials: ((v as any).createdBy || 'GE').substring(0, 2).toUpperCase(),
        type: deriveVersionType(v),
        summary: v.versionLabel || `Versie ${v.versionNumber}`,
        changes: deriveChanges(v),
        valuation: (v as any).valuationResult?.valuation_midpoint || (v as any).valuationResult?.equity_value_mid,
        valuationLow: (v as any).valuationResult?.valuation_min || (v as any).valuationResult?.equity_value_low,
        valuationHigh: (v as any).valuationResult?.valuation_max || (v as any).valuationResult?.equity_value_high,
        ebitda: (v as any).valuationResult?.normalized_ebitda || (v as any).valuationResult?.ebitda,
        multiple: (v as any).valuationResult?.ebitda_multiple || (v as any).valuationResult?.revenue_multiple,
        isCurrent: v.versionNumber === activeVersionNumber || v.isActive,
      }))
  }, [storeVersions, activeVersionNumber])

  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set()); // Current version expanded by default
  const [restoringVersion, setRestoringVersion] = useState<string | null>(null);
  
  // Compare mode state
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  
  const toggleVersion = (id: string) => {
    if (compareMode) {
      // In compare mode, toggle selection
      setSelectedForCompare(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else if (next.size < 2) {
          next.add(id);
        }
        return next;
      });
    } else {
      // Normal expansion
      setExpandedVersions(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    }
  };

  // Get versions for comparison
  const versionsToCompare = useMemo(() => {
    if (selectedForCompare.size !== 2) return { versionA: null, versionB: null };
    const ids = Array.from(selectedForCompare);
    return {
      versionA: historyVersions.find(v => v.id === ids[0]) || null,
      versionB: historyVersions.find(v => v.id === ids[1]) || null,
    };
  }, [selectedForCompare, historyVersions]);
  
  const handleRestoreVersion = async (version: HistoryVersion) => {
    setRestoringVersion(version.id);
    try {
      // Look up the full ValuationVersion from the store (has formData, normalizations, etc.)
      const fullVersion = storeVersions.find(
        (v) => v.id === version.id || v.versionNumber === version.version
      )
      // Pass full store version (with formData, valuationResult, normalization_data)
      // rather than the stripped HistoryVersion which lacks these fields
      await onVersionRestore?.(fullVersion || version);
    } finally {
      setRestoringVersion(null);
    }
  };
  
  const handleStartCompare = () => {
    if (selectedForCompare.size === 2) {
      setCompareModalOpen(true);
    }
  };

  const handleSwapVersions = () => {
    const ids = Array.from(selectedForCompare);
    if (ids.length === 2) {
      setSelectedForCompare(new Set([ids[1], ids[0]]));
    }
  };
  
  if (!report) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-background">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-foreground/[0.06] flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-foreground/30" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Geen geschiedenis beschikbaar
          </h3>
          <p className="text-sm text-foreground/50">
            Genereer eerst een bedrijfsschatting om de versiegeschiedenis te bekijken.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 px-4 sm:px-6 py-4 sm:py-5 border-b border-foreground/[0.06]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-foreground">Versiegeschiedenis</h2>
            <p className="text-xs sm:text-sm text-foreground/50 mt-1">
              {storeLoading ? 'Laden...' : storeError ? 'Versiegeschiedenis kon niet worden geladen' : `${historyVersions.length} versies · Audit trail`}
            </p>
          </div>
          
          {/* Compare Toggle */}
          <div className="flex items-center gap-2">
            {compareMode && selectedForCompare.size === 2 && (
              <Button
                size="sm"
                onClick={handleStartCompare}
                className="gap-1.5"
              >
                <ArrowLeftRight className="w-4 h-4" />
                Vergelijk ({selectedForCompare.size})
              </Button>
            )}
            <Button
              variant={compareMode ? "primary" : "outline"}
              size="sm"
              onClick={() => {
                setCompareMode(!compareMode);
                setSelectedForCompare(new Set());
              }}
              className="gap-1.5"
            >
              <GitCompare className="w-4 h-4" />
              {compareMode ? 'Stop vergelijken' : 'Vergelijk'}
            </Button>
          </div>
        </div>
        
        {/* Compare Mode Instructions */}
        <AnimatePresence>
          {compareMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 p-3 rounded-lg bg-primary/[0.05] border border-primary/20"
            >
              <p className="text-xs text-primary">
                Selecteer 2 versies om te vergelijken ({selectedForCompare.size}/2 geselecteerd)
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Visual Timeline */}
      {historyVersions.length > 0 && <VisualTimeline versions={historyVersions} />}

      {/* Timeline List */}
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-20 sm:pb-6">
        {/* Loading state */}
        {storeLoading && historyVersions.length === 0 && (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-5 h-5 animate-spin text-foreground/40 mr-2" />
            <span className="text-sm text-foreground/50">Versies laden...</span>
          </div>
        )}

        {/* Error state */}
        {storeError && historyVersions.length === 0 && !storeLoading && (
          <div className="p-6 text-center">
            <p className="text-sm text-destructive/80 mb-2">Versiegeschiedenis kon niet worden geladen</p>
            <button
              onClick={() => reportId && fetchVersions(reportId)}
              className="text-xs text-primary hover:underline"
            >
              Opnieuw proberen
            </button>
          </div>
        )}

        {/* Empty state */}
        {!storeLoading && !storeError && historyVersions.length === 0 && (
          <div className="flex flex-col items-center justify-center p-8">
            <div className="w-12 h-12 rounded-xl bg-foreground/[0.04] flex items-center justify-center mb-3">
              <Clock className="w-6 h-6 text-foreground/25" />
            </div>
            <p className="text-sm font-medium text-foreground/60 mb-1">Nog geen versies</p>
            <p className="text-xs text-foreground/40 text-center max-w-[240px]">
              Na uw eerste berekening wordt automatisch een versie aangemaakt.
            </p>
          </div>
        )}

        <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
          {historyVersions.map((version, index) => {
            const config = typeConfig[version.type];
            const TypeIcon = config.icon;
            const isExpanded = expandedVersions.has(version.id);
            const prevVersion = historyVersions[index + 1];
            const valuationDiff = version.valuation && prevVersion?.valuation 
              ? version.valuation - prevVersion.valuation 
              : 0;
            const isSelectedForCompare = selectedForCompare.has(version.id);

            return (
              <motion.div
                key={version.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  "rounded-xl border transition-all duration-200",
                  isSelectedForCompare && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                  version.isCurrent 
                    ? "border-primary/30 bg-primary/[0.02]" 
                    : "border-foreground/[0.06] bg-foreground/[0.02] hover:bg-foreground/[0.03]"
                )}
              >
                {/* Version Header - Clickable */}
                <button
                  onClick={() => toggleVersion(version.id)}
                  className="w-full p-3 sm:p-4 flex items-start gap-3 sm:gap-4 text-left min-h-[56px]"
                >
                  {/* Compare Checkbox or Version Badge */}
                  {compareMode ? (
                    <div className={cn(
                      "shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all",
                      isSelectedForCompare
                        ? "bg-primary text-primary-foreground"
                        : "bg-foreground/[0.08] text-foreground/40 hover:bg-foreground/[0.12]"
                    )}>
                      {isSelectedForCompare ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <span className="text-xs font-semibold">v{version.version}</span>
                      )}
                    </div>
                  ) : (
                    <div className={cn(
                      "shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-semibold text-xs sm:text-sm",
                      version.isCurrent 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-foreground/[0.08] text-foreground/60"
                    )}>
                      {version.isCurrent ? (
                        <Check className="w-4 h-4 sm:w-5 sm:h-5" />
                      ) : (
                        `v${version.version}`
                      )}
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {/* Clean text-only badge - no icon clutter */}
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-foreground/[0.06] text-foreground/60 border border-foreground/[0.08]">
                        {config.label}
                      </span>
                      {/* Only "HUIDIG" gets the primary accent (30% rule) */}
                      {version.isCurrent && (
                        <span className="text-[9px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                          HUIDIG
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-medium text-foreground/90">
                      {version.summary}
                    </h4>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-foreground/40">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {version.author}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatTime(version.timestamp)}
                      </span>
                    </div>
                  </div>

                  {/* Right side - Valuation + Expand */}
                  <div className="shrink-0 flex items-center gap-3">
                    {version.valuation && (
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground/90 font-mono tabular-nums">
                          {formatCurrency(version.valuation)}
                        </p>
                        {/* Deltas: Success (green) for positive, Secondary (clay) for negative */}
                        {valuationDiff !== 0 && (
                          <p className={cn(
                            "text-[11px] font-mono tabular-nums",
                            valuationDiff > 0 ? "text-success" : "text-secondary"
                          )}>
                            {valuationDiff > 0 ? '+' : ''}{formatCurrency(valuationDiff)}
                          </p>
                        )}
                      </div>
                    )}
                    {!compareMode && (
                      <ChevronDown className={cn(
                        "w-4 h-4 text-foreground/30 transition-transform",
                        isExpanded && "rotate-180"
                      )} />
                    )}
                  </div>
                </button>

                {/* Expanded Content */}
                <AnimatePresence>
                  {isExpanded && !compareMode && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 1 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-0">
                        {/* Valuation Summary Card */}
                        <ValuationSummaryCard version={version} />

                        {/* Changes List with Source References */}
                        {version.changes.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/40 mb-2">
                              Wijzigingen · Audit Trail
                            </p>
                            {version.changes.map((change, changeIndex) => (
                              <div 
                                key={changeIndex}
                                className="flex items-center justify-between text-xs bg-foreground/[0.02] rounded-lg px-3 py-2.5 border border-foreground/[0.05]"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-foreground/60 truncate">{change.field}</span>
                                  {change.sourceRef && (
                                    <span className="shrink-0 text-[9px] text-foreground/40 px-1.5 py-0.5 rounded bg-foreground/[0.04] font-mono border border-foreground/[0.06]">
                                      {change.sourceRef}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {change.oldValue && (
                                    <>
                                      <span className="text-foreground/25 line-through font-mono text-[11px]">{change.oldValue}</span>
                                      <ChevronRight className="w-3 h-3 text-foreground/15" />
                                    </>
                                  )}
                                  <span className="font-medium text-foreground/80 font-mono text-[11px]">{change.newValue}</span>
                                  {/* Impact: Success (green) for positive, Secondary (clay) for negative */}
                                  {change.impact && (
                                    <span className={cn(
                                      "font-mono text-[10px] px-1.5 py-0.5 rounded border",
                                      change.impact > 0 
                                        ? "text-success bg-success/10 border-success/20" 
                                        : "text-secondary bg-secondary/10 border-secondary/20"
                                    )}>
                                      {change.impact > 0 ? '+' : ''}{formatCurrency(change.impact)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Action Footer */}
                        <div className="mt-4 pt-3 border-t border-foreground/[0.04]">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] text-foreground/40">
                              {formatDate(version.timestamp)}
                            </span>
                          </div>
                          
                          {/* Action Buttons */}
                          <div className="flex items-center gap-2">
                            {version.isCurrent ? (
                              /* Current version badge */
                              <div className="flex-1 flex items-center justify-center gap-2 h-9 px-4 rounded-lg bg-primary/[0.06] border border-primary/20 text-primary text-sm font-medium">
                                <Check className="w-4 h-4" />
                                Huidige versie
                              </div>
                            ) : (
                              /* Restore Version - Only on non-current versions */
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRestoreVersion(version);
                                }}
                                disabled={restoringVersion === version.id}
                                className="flex-1 flex items-center justify-center gap-2 h-9 px-4 rounded-lg border border-foreground/[0.15] bg-transparent text-foreground/80 hover:bg-foreground/[0.06] hover:border-foreground/[0.25] transition-colors text-sm font-medium disabled:opacity-50"
                              >
                                {restoringVersion === version.id ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Herstellen...
                                  </>
                                ) : (
                                  <>
                                    <RotateCcw className="w-4 h-4" />
                                    Herstel naar deze versie
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Compare Modal */}
      <VersionCompareModal
        open={compareModalOpen}
        onOpenChange={setCompareModalOpen}
        versionA={versionsToCompare.versionA}
        versionB={versionsToCompare.versionB}
        onRestore={handleRestoreVersion}
        onSwap={handleSwapVersions}
      />
    </div>
  );
}
