'use client';

/**
 * Calculation Breakdown Panel
 * 
 * Shows detailed methodology, EBITDA waterfall, and calculation steps.
 * Displayed inline in the right panel (not modal) when Info tab is active.
 * Light mode design for professional accounting review.
 */

import { motion } from 'framer-motion';
import { 
  Calculator, 
  TrendingUp, 
  TrendingDown, 
  Scale, 
  Info, 
  ArrowRight,
  Plus,
  Minus,
  Equal,
  BarChart3,
  FileText,
  BookOpen
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/design-system/utils';

export interface CalculationBreakdownPanelProps {
  report?: {
    companyName: string;
    valuation: number;
    ebitda: number;
    multiple: number;
    metrics?: Array<{
      label: string;
      value: string;
      change?: number;
    }>;
  } | null;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Sample EBITDA adjustments for demo (use labelKey/descriptionKey for i18n)
const ebitdaAdjustments: Array<{
  id: string;
  labelKey: string;
  value: number;
  type: 'base' | 'add' | 'subtract' | 'result';
  descriptionKey?: string;
}> = [
  { id: '1', labelKey: 'reportedEbitda', value: 680000, type: 'base' },
  { id: '2', labelKey: 'ownerSalaryNorm', value: 60000, type: 'add', descriptionKey: 'ownerSalaryNormDesc' },
  { id: '3', labelKey: 'oneTimeMarketing', value: 25000, type: 'add', descriptionKey: 'oneTimeMarketingDesc' },
  { id: '4', labelKey: 'directorPersonal', value: 18000, type: 'add', descriptionKey: 'directorPersonalDesc' },
  { id: '5', labelKey: 'normalizedEbitda', value: 783000, type: 'result' },
];

export function CalculationBreakdownPanel({
  report,
}: CalculationBreakdownPanelProps) {
  const t = useTranslations('calculationBreakdown');
  if (!report) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-background">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">{t('noCalculationAvailable')}</h3>
          <p className="text-sm text-muted-foreground mt-2">{t('noCalculationDesc')}</p>
        </div>
      </div>
    );
  }

  const calculatedEbitda = report.ebitda;
  const valuationLow = report.valuation * 0.7;
  const valuationHigh = report.valuation * 1.3;

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="p-6 md:p-8 max-w-3xl mx-auto">
        
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calculator className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">{t('calculationDetails')}</h2>
          </div>
          <p className="text-sm text-muted-foreground ml-10">
            {t('methodologyTransparency', { companyName: report.companyName })}
          </p>
        </motion.div>

        {/* EBITDA Waterfall / Bridge */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            {t('ebitdaBridge')}
          </h3>
          
          <div className="bg-muted/50 rounded-xl p-4 space-y-2">
            {ebitdaAdjustments.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + index * 0.05 }}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg",
                  item.type === 'base' && "bg-card border border-foreground/10",
                  item.type === 'add' && "bg-card border-l-4 border-l-success",
                  item.type === 'subtract' && "bg-card border-l-4 border-l-destructive",
                  item.type === 'result' && "bg-primary text-primary-foreground"
                )}
              >
                {/* Icon */}
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                  item.type === 'base' && "bg-muted",
                  item.type === 'add' && "bg-success/10",
                  item.type === 'subtract' && "bg-destructive/10",
                  item.type === 'result' && "bg-primary-foreground/20"
                )}>
                  {item.type === 'base' && <Equal className="w-3 h-3 text-muted-foreground" />}
                  {item.type === 'add' && <Plus className="w-3 h-3 text-success" />}
                  {item.type === 'subtract' && <Minus className="w-3 h-3 text-destructive" />}
                  {item.type === 'result' && <Equal className="w-3 h-3 text-primary-foreground" />}
                </div>

                {/* Label & Description */}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-medium",
                    item.type === 'result' ? "text-primary-foreground" : "text-foreground"
                  )}>
                    {t(item.labelKey)}
                  </p>
                  {item.descriptionKey && (
                    <p className="text-xs text-muted-foreground">{t(item.descriptionKey)}</p>
                  )}
                </div>

                {/* Value */}
                <span className={cn(
                  "font-mono text-sm font-semibold tabular-nums shrink-0",
                  item.type === 'add' && "text-success",
                  item.type === 'subtract' && "text-destructive",
                  item.type === 'base' && "text-muted-foreground",
                  item.type === 'result' && "text-primary-foreground"
                )}>
                  {item.type === 'add' && '+'}
                  {item.type === 'subtract' && '−'}
                  {formatCurrency(item.value)}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Multiple Application */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            {t('indicativeCalculation')}
          </h3>

          <div className="grid grid-cols-3 gap-4">
            {/* EBITDA */}
            <div className="bg-muted/50 rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t('normEbitda')}</p>
              <p className="text-xl font-bold font-mono text-foreground">{formatCurrency(report.ebitda)}</p>
            </div>

            {/* Times symbol */}
            <div className="flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-primary text-lg font-bold">×</span>
              </div>
            </div>

            {/* Multiple with explanation */}
            <div className="bg-muted/50 rounded-xl p-4 text-center relative group">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t('sectorMultiple')}</p>
              <p className="text-xl font-bold font-mono text-foreground">{report.multiple.toFixed(1)}x</p>
              <div className="absolute left-0 right-0 -bottom-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[10px] bg-muted text-foreground px-2 py-0.5 rounded-full">
                  Industrial Manufacturing
                </span>
              </div>
            </div>
          </div>

          {/* Equals */}
          <div className="flex items-center justify-center my-4">
            <ArrowRight className="w-5 h-5 text-muted-foreground" />
          </div>

          {/* Result */}
          <div className="bg-gradient-to-r from-primary to-primary/90 rounded-xl p-6 text-center text-primary-foreground">
            <p className="text-xs text-primary-foreground/80 uppercase tracking-wider mb-1">{t('enterpriseValue')}</p>
            <p className="text-3xl font-bold font-mono">{formatCurrency(report.valuation)}</p>
            <p className="text-xs text-primary-foreground/70 mt-2">
              {t('rangeLabel', { low: formatCurrency(valuationLow), high: formatCurrency(valuationHigh) })}
            </p>
          </div>
        </motion.section>

        {/* Methodology */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-8"
        >
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            {t('whyThisMultiple')}
          </h3>

          <div className="space-y-3">
            <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
              <div className="flex gap-3">
                <Info className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-warning font-medium">{t('sectorRange')}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t('methodologyIntro')}</p>
                  <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                    <li className="flex items-start gap-1.5">
                      <span className="text-warning">•</span>
                      <span>{t('sizePremium')}</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-warning">•</span>
                      <span>{t('ownerDependency')}</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-warning">•</span>
                      <span>{t('sectorStability')}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-muted/50 border border-foreground/10 rounded-xl p-4">
              <p className="text-xs text-muted-foreground leading-relaxed">{t('sources')}</p>
            </div>
          </div>
        </motion.section>

        {/* Comparables (mini table) */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <Scale className="w-4 h-4 text-muted-foreground" />
            {t('comparableTransactions')}
          </h3>

          <div className="overflow-hidden rounded-xl border border-foreground/10">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">{t('company')}</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">{t('multiple')}</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">{t('revenue')}</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">{t('date')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {[
                  { companyKey: 'comparableA' as const, multiple: 5.8, revenue: 1500000, date: '2025-Q3' },
                  { companyKey: 'comparableB' as const, multiple: 5.2, revenue: 850000, date: '2025-Q2' },
                  { companyKey: 'comparableC' as const, multiple: 5.5, revenue: 1200000, date: '2025-Q1' },
                ].map((comp, i) => (
                  <tr key={i} className="hover:bg-muted/50">
                    <td className="px-4 py-3 text-foreground">{t(comp.companyKey)}</td>
                    <td className="px-4 py-3 text-right font-mono text-foreground">{comp.multiple.toFixed(1)}x</td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">{formatCurrency(comp.revenue)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{comp.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
