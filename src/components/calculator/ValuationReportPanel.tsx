'use client';

/**
 * Valuation Report Panel
 * 
 * Displays the valuation report with enterprise value, metrics,
 * and methodology notes. Supports PDF export.
 * Aurora design system compliant.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { springDefault } from '@/design-system/components/motion';
import { 
  TrendingUp, 
  TrendingDown, 
  Download, 
  Share2, 
  RefreshCw, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  Shield,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/design-system/utils';
import { HTMLProcessor } from '@/utils/htmlProcessor';
import { 
  AuroraButton,
  Badge,
  AuroraScrollArea,
} from '@/design-system';

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface ValuationReportData {
  id: string;
  companyName: string;
  valuation: number;
  valuationLow?: number;
  valuationHigh?: number;
  ebitda: number;
  normalizedEbitda?: number;
  multiple: number;
  multipleRange?: { low: number; high: number };
  generatedAt: Date;
  confidenceLevel?: 'high' | 'medium' | 'low';
  confidenceScore?: number;
  metrics?: ReportMetric[];
  /** Full HTML report from ValuationIQ */
  htmlReport?: string;
  /** Info tab HTML from ValuationIQ */
  infoTabHtml?: string;
  /** Recommended asking price */
  recommendedAskingPrice?: number;
}

export interface ReportMetric {
  label: string;
  value: string;
  change?: number;
  icon?: React.ReactNode;
}

export type ReportStatus = 'draft' | 'final';

export interface ValuationReportPanelProps {
  report: ValuationReportData | null;
  isGenerating?: boolean;
  isExporting?: boolean;
  onExport?: () => void;
  onRegenerate?: () => void;
  onShare?: () => void;
  onContinue?: () => void;
  // Report status for accountant approval flow
  reportStatus?: ReportStatus;
  onStatusChange?: (status: ReportStatus) => void;
  canChangeStatus?: boolean;
  className?: string;
}

// ─────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────

const formatCurrency = (amount: number) => {
  if (amount >= 1000000) {
    return `€${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `€${(amount / 1000).toFixed(0)}K`;
  }
  return `€${amount.toFixed(0)}`;
};

const formatFullCurrency = (amount: number) => {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// ─────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────

export function ValuationReportPanel({
  report,
  isGenerating = false,
  isExporting = false,
  onExport,
  onRegenerate,
  onShare,
  onContinue,
  reportStatus = 'draft',
  onStatusChange,
  canChangeStatus = true,
  className,
}: ValuationReportPanelProps) {
  const t = useTranslations();

  const handleStatusToggle = () => {
    if (canChangeStatus && onStatusChange) {
      onStatusChange(reportStatus === 'draft' ? 'final' : 'draft');
    }
  };

  if (!report && !isGenerating) {
    return <PlaceholderPreview />;
  }

  if (isGenerating) {
    return <GeneratingState />;
  }

  const valuationLow = report!.valuationLow || report!.valuation * 0.85;
  const valuationHigh = report!.valuationHigh || report!.valuation * 1.15;

  return (
    <div className={cn("relative h-full overflow-hidden bg-card", className)}>
      {/* Subtle gradient overlay for depth */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)',
        }}
      />
      
      <AuroraScrollArea className="relative z-10 h-full">
        <div className="p-6 md:p-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springDefault}
            className="max-w-2xl mx-auto space-y-6"
          >
            {/* Report Header */}
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                {/* Status Badge - Toggleable */}
                <button
                  onClick={handleStatusToggle}
                  disabled={!canChangeStatus}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mb-3",
                    "text-[11px] font-medium uppercase tracking-wide",
                    "transition-all duration-200",
                    canChangeStatus && "cursor-pointer hover:scale-[1.02] active:scale-[0.98]",
                    !canChangeStatus && "cursor-default",
                    reportStatus === 'final'
                      ? "bg-success/15 text-success border border-success/30"
                      : "bg-warning/15 text-warning border border-warning/30"
                  )}
                  title={canChangeStatus ? (t('report.clickToChangeStatus') || 'Klik om status te wijzigen') : undefined}
                >
                  {reportStatus === 'final' ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t('report.finalReport') || 'Definitief rapport'}
                    </>
                  ) : (
                    <>
                      <Clock className="w-3.5 h-3.5" />
                      {t('report.draftReport') || 'Concept rapport'}
                    </>
                  )}
                </button>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                  {report!.companyName}
                </h2>
                <p className="text-sm text-foreground/50 mt-1">
                  {t('report.valuation') || 'Bedrijfsschatting'} • {report!.generatedAt.toLocaleDateString('nl-BE', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>

              <div className="flex gap-2">
                {onShare && (
                  <AuroraButton
                    variant="outline"
                    size="sm"
                    onClick={onShare}
                    className="gap-1.5"
                  >
                    <Share2 className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('common.share') || 'Delen'}</span>
                  </AuroraButton>
                )}
                {onExport && (
                  <AuroraButton
                    variant="secondary"
                    size="sm"
                    onClick={onExport}
                    disabled={isExporting}
                    className="gap-1.5"
                  >
                    {isExporting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    {isExporting ? (t('common.exporting') || 'Exporteren...') : (t('report.exportPDF') || 'Exporteer PDF')}
                  </AuroraButton>
                )}
              </div>
            </div>

            {/* Main Valuation Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...springDefault, delay: 0.1 }}
              className={cn(
                "relative overflow-hidden rounded-2xl border border-primary/30 p-6 md:p-8",
              )}
              style={{
                background:
                  'linear-gradient(135deg, hsl(var(--primary) / 0.12) 0%, hsl(var(--accent) / 0.06) 50%, hsl(var(--muted)) 100%)',
                boxShadow:
                  '0 20px 60px -15px hsl(var(--primary) / 0.15), inset 0 1px 0 0 hsl(var(--foreground) / 0.05)',
              }}
            >
              {/* Decorative glow */}
              <div
                className="absolute top-0 right-0 w-60 h-60 rounded-full blur-3xl pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, hsl(var(--primary) / 0.12) 0%, transparent 70%)',
                }}
              />

              <div className="relative">
                <p className="text-xs text-foreground/50 uppercase tracking-wider mb-2">
                  {t('report.estimatedValue') || 'Geschatte ondernemingswaarde'}
                </p>
                <div className="flex items-baseline gap-3">
                  <span className="text-5xl md:text-6xl font-bold text-foreground font-mono tabular-nums tracking-tight">
                    {formatCurrency(report!.valuation)}
                  </span>
                  <span className="text-xl text-foreground/50 font-medium">EUR</span>
                </div>

                <div className="h-px bg-foreground/[0.08] my-6" />

                <div className="flex items-center gap-6 lg:gap-8 text-sm flex-wrap">
                  <div>
                    <span className="text-foreground/50 text-xs uppercase tracking-wider">
                      {t('report.normalizedEbitda') || 'Genormaliseerde EBITDA'}
                    </span>
                    <p className="font-bold text-foreground font-mono text-xl mt-1 tabular-nums">
                      {formatCurrency(report!.normalizedEbitda ?? report!.ebitda ?? 0)}
                    </p>
                  </div>
                  <div className="w-px h-12 bg-foreground/[0.08] hidden sm:block" />
                  <div>
                    <span className="text-foreground/50 text-xs uppercase tracking-wider">
                      {t('report.appliedMultiple') || 'Toegepaste multiple'}
                    </span>
                    <p className="font-bold text-foreground font-mono text-xl mt-1 tabular-nums">
                      {report!.multiple.toFixed(2)}x
                    </p>
                  </div>
                  <div className="w-px h-12 bg-foreground/[0.08] hidden sm:block" />
                  <div>
                    <span className="text-foreground/50 text-xs uppercase tracking-wider">
                      {t('report.indicativeRange') || 'Indicatief bereik'}
                    </span>
                    <p className="font-bold text-foreground font-mono text-xl mt-1 tabular-nums">
                      {formatCurrency(valuationLow)} - {formatCurrency(valuationHigh)}
                    </p>
                  </div>
                </div>

                {/* Recommended Asking Price */}
                {report!.recommendedAskingPrice != null && report!.recommendedAskingPrice > 0 && (
                  <>
                    <div className="h-px bg-foreground/[0.08] mt-5 mb-4" />
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-foreground/50 text-xs uppercase tracking-wider">
                          {t('report.suggestedListingPrice') || 'Voorgestelde vraagprijs'}
                        </span>
                        <p className="font-bold text-primary font-mono text-2xl mt-1 tabular-nums">
                          {formatCurrency(report!.recommendedAskingPrice)}
                        </p>
                      </div>
                      <span className="text-xs text-foreground/40 max-w-[140px] text-right">
                        {t('report.negotiationBuffer') || 'Strategische buffer voor onderhandeling'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </motion.div>

            {/* Metrics Grid */}
            {report!.metrics && report!.metrics.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {report!.metrics.map((metric, index) => (
                  <motion.div
                    key={metric.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...springDefault, delay: 0.15 + index * 0.03 }}
                    className="rounded-xl bg-muted/50 border border-border p-4 hover:border-primary/30 transition-colors"
                  >
                    <p className="text-xs text-foreground/50 mb-1.5">{metric.label}</p>
                    <div className="flex items-end justify-between">
                      <span className="text-xl font-bold text-foreground font-mono tabular-nums">
                        {metric.value}
                      </span>
                      {metric.change !== undefined && (
                        <span
                          className={cn(
                            'flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-md',
                            metric.change >= 0
                              ? 'text-success bg-success/10'
                              : 'text-destructive bg-destructive/10'
                          )}
                        >
                          {metric.change >= 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {Math.abs(metric.change)}%
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Methodology Note */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...springDefault, delay: 0.3 }}
              className="rounded-xl bg-muted/30 border border-border p-5"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-1">
                    {t('report.methodology') || 'Methodologie'}
                  </h4>
                  <p className="text-xs text-foreground/50 leading-relaxed">
                    {t('report.methodologyText') || 
                      `Deze indicatieve bedrijfsschatting is gebaseerd op vergelijkbare transactieanalyse met
                      sectorspecifieke EBITDA-multiples (IVS 2022, Damodaran). Het bereik houdt rekening met 
                      huidige marktomstandigheden en bedrijfsspecifieke risicofactoren.
                      Exporteer de PDF voor het volledige rapport inclusief EBITDA-bridge en
                      juridische disclaimers.`
                    }
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Full HTML Report from ValuationIQ */}
            {report!.htmlReport && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...springDefault, delay: 0.35 }}
                className="rounded-xl border border-border overflow-hidden"
              >
                <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    {t('report.fullReport') || 'Volledig rapport'}
                  </span>
                </div>
                <div className="valuation-report">
                  <div
                    dangerouslySetInnerHTML={{ __html: HTMLProcessor.sanitize(report!.htmlReport ?? '') }}
                  />
                </div>
              </motion.div>
            )}

            {/* Action Footer */}
            <div className="flex items-center justify-center gap-4 pt-4">
              {onRegenerate && (
                <AuroraButton
                  variant="ghost"
                  size="sm"
                  onClick={onRegenerate}
                  className="gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  {t('report.regenerate') || 'Analyse opnieuw genereren'}
                </AuroraButton>
              )}
              {onContinue && (
                <AuroraButton
                  variant="primary"
                  size="sm"
                  onClick={onContinue}
                  className="gap-2"
                >
                  {t('common.continue') || 'Doorgaan'}
                  <ArrowRight className="w-4 h-4" />
                </AuroraButton>
              )}
            </div>
          </motion.div>
        </div>
      </AuroraScrollArea>
    </div>
  );
}

// ─────────────────────────────────────────
// PLACEHOLDER PREVIEW
// ─────────────────────────────────────────

function PlaceholderPreview() {
  const t = useTranslations();

  return (
    <div className="relative h-full flex flex-col items-center justify-center p-8 text-center overflow-hidden bg-card">
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)',
        }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={springDefault}
        className="relative z-10 w-full max-w-md"
      >
        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-muted flex items-center justify-center mb-3 sm:mb-4 mx-auto transition-all duration-300 hover:scale-110">
          <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-foreground">
          {t('report.placeholder.title') || 'Uw rapport verschijnt hier'}
        </h3>
        <p className="mt-2 text-sm text-foreground/50 max-w-sm mx-auto leading-relaxed">
          {t('report.placeholder.description') || 
            `Vul links de bedrijfsgegevens in. Zodra u klaar bent, genereert het systeem
            automatisch een verdedigbaar schattingsrapport met audit trail.`
          }
        </p>
        <div className="mt-6 flex items-center justify-center gap-3 text-xs text-foreground/40">
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-primary/40" />
            {t('report.placeholder.time') || '±15 min gemiddelde doorlooptijd'}
          </span>
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────
// GENERATING STATE
// ─────────────────────────────────────────

function GeneratingState() {
  const t = useTranslations();

  return (
    <div className="relative h-full flex flex-col items-center justify-center p-8 overflow-hidden bg-card">
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)',
        }}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative z-10 text-center"
      >
        {/* Animated rings */}
        <div className="relative w-24 h-24 mx-auto mb-8">
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-primary/20"
            animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.div
            className="absolute inset-2 rounded-full border-2 border-primary/30"
            animate={{ scale: [1, 1.2, 1], opacity: [0.6, 0.2, 0.6] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
          />
          <motion.div
            className="absolute inset-4 rounded-full border-2 border-primary/40"
            animate={{ scale: [1, 1.1, 1], opacity: [0.7, 0.3, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.6 }}
          />
          <div className="absolute inset-6 rounded-full bg-primary/10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        </div>

        <h3 className="text-xl font-bold text-foreground mb-2 tracking-tight">
          {t('report.generating.title') || 'Rapport genereren'}
        </h3>
        <p className="text-sm text-foreground/50 max-w-xs mx-auto mb-6">
          {t('report.generating.description') || 'Financiële gegevens analyseren en schattingsmetrics berekenen...'}
        </p>

        {/* Progress steps */}
        <div className="flex flex-col items-start text-left max-w-[200px] mx-auto space-y-2">
          <ProgressStep label={t('report.generating.step1') || 'Documenten verwerken'} status="complete" />
          <ProgressStep label={t('report.generating.step2') || 'EBITDA berekenen'} status="active" />
          <ProgressStep label={t('report.generating.step3') || 'Multiples toepassen'} status="pending" />
          <ProgressStep label={t('report.generating.step4') || 'Rapport genereren'} status="pending" />
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────
// PROGRESS STEP
// ─────────────────────────────────────────

interface ProgressStepProps {
  label: string;
  status: 'complete' | 'active' | 'pending';
}

function ProgressStep({ label, status }: ProgressStepProps) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div
        className={cn(
          'w-4 h-4 rounded-full flex items-center justify-center',
          status === 'complete' && 'bg-success/20',
          status === 'active' && 'bg-primary/20 animate-pulse',
          status === 'pending' && 'bg-muted'
        )}
      >
        {status === 'complete' && <span className="text-success text-[10px]">✓</span>}
        {status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
      </div>
      <span
        className={cn(
          status === 'complete' && 'text-foreground/50',
          status === 'active' && 'text-foreground',
          status === 'pending' && 'text-foreground/30'
        )}
      >
        {label}
      </span>
    </div>
  );
}

export default ValuationReportPanel;
