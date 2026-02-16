'use client';

/**
 * Report Preview Panel
 * 
 * Embedded version of the ValuationReportTemplate for inline preview.
 * Uses a forced light theme for professional "paper-like" appearance.
 */

import { motion } from 'framer-motion';
import { springDefault } from '@/design-system/components/motion';
import { 
  TrendingUp,
  TrendingDown,
  Shield,
  FileText,
  BarChart3,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/design-system/utils';

export interface ReportPreviewPanelProps {
  report?: {
    companyName: string;
    valuation: number;
    ebitda: number;
    multiple: number;
    generatedAt: Date;
    metrics?: Array<{
      label: string;
      value: string;
      change?: number;
    }>;
  } | null;
}

const formatCurrency = (amount: number) => {
  if (amount >= 1000000) return `€${(amount / 1000000).toFixed(2)}M`;
  if (amount >= 1000) return `€${(amount / 1000).toFixed(0)}K`;
  return `€${amount.toLocaleString('nl-BE')}`;
};

export function ReportPreviewPanel({ report }: ReportPreviewPanelProps) {
  if (!report) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-background">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <FileText className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Jouw bedrijfsschatting</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Vul de gegevens in of start een gesprek om je gepersonaliseerde schattingsrapport te genereren.
          </p>
        </div>
      </div>
    );
  }

  const valuationLow = report.valuation * 0.7;
  const valuationHigh = report.valuation * 1.3;

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-3xl mx-auto">
        {/* Cover / Hero Section */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden"
        >
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-teal-400 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 px-8 py-12">
            <div className="flex items-center justify-between mb-12">
              <span className="text-sm font-semibold text-white/80 tracking-wider">UPSWITCH</span>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-500/20 border border-teal-400/30">
                <CheckCircle2 className="w-3 h-3 text-teal-400" />
                <span className="text-[10px] font-medium text-teal-300 uppercase tracking-wider">Concept Rapport</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 uppercase tracking-[0.2em] mb-4">Indicatieve Bedrijfsschatting</p>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">{report.companyName}</h1>

            <div className="bg-foreground/5 backdrop-blur-sm rounded-2xl border border-foreground/10 p-6 mb-6">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Geschatte Ondernemingswaarde</p>
              <div className="flex items-baseline gap-4">
                <span className="text-5xl md:text-6xl font-bold font-mono tabular-nums text-teal-400">
                  {formatCurrency(report.valuation)}
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-3">
                Bereik: {formatCurrency(valuationLow)} – {formatCurrency(valuationHigh)}
              </p>
            </div>

            <div className="flex gap-6 text-sm">
              <div>
                <p className="text-slate-500 text-xs uppercase tracking-wider">EBITDA</p>
                <p className="font-semibold font-mono text-white">{formatCurrency(report.ebitda)}</p>
              </div>
              <div className="w-px bg-white/10" />
              <div>
                <p className="text-slate-500 text-xs uppercase tracking-wider">Multiple</p>
                <p className="font-semibold font-mono text-white">{report.multiple.toFixed(1)}x</p>
              </div>
              <div className="w-px bg-white/10" />
              <div>
                <p className="text-slate-500 text-xs uppercase tracking-wider">Datum</p>
                <p className="font-semibold text-white">
                  {report.generatedAt.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="px-8 py-8 space-y-8">
          {report.metrics && report.metrics.length > 0 && (
            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springDefault, delay: 0.1 }}>
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-slate-400" />
                Kerncijfers
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {report.metrics.map((metric, index) => (
                  <motion.div
                    key={metric.label}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...springDefault, delay: 0.15 + index * 0.03 }}
                    className="bg-slate-50 rounded-xl p-4 hover:bg-slate-100 transition-colors"
                  >
                    <p className="text-xs text-slate-500 mb-1">{metric.label}</p>
                    <div className="flex items-end justify-between">
                      <span className="text-lg font-bold text-slate-900 font-mono tabular-nums">{metric.value}</span>
                      {metric.change !== undefined && (
                        <span className={cn(
                          "flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded",
                          metric.change >= 0 ? "text-emerald-700 bg-emerald-100" : "text-rose-700 bg-rose-100"
                        )}>
                          {metric.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {Math.abs(metric.change)}%
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springDefault, delay: 0.3 }} className="bg-teal-50 border border-teal-200 rounded-xl p-5">
            <div className="flex gap-3">
              <Shield className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-teal-900 mb-1">Methodologie</h3>
                <p className="text-xs text-teal-700 leading-relaxed">
                  Deze indicatieve bedrijfsschatting is gebaseerd op vergelijkbare transactieanalyse met 
                  sectorspecifieke EBITDA-multiples (Damodaran). Het bereik houdt rekening met 
                  huidige marktomstandigheden, bedrijfsspecifieke risicofactoren en groeitraject.
                </p>
              </div>
            </div>
          </motion.section>

          <motion.footer initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...springDefault, delay: 0.4 }} className="text-[10px] text-slate-400 border-t border-slate-200 pt-6 leading-relaxed">
            <p>
              <strong>Disclaimer:</strong> Dit document betreft een indicatieve bedrijfsschatting en vormt geen 
              formele waardering conform internationale standaarden. Voor formele transacties dient een gecertificeerde 
              waardering door een erkend expert te worden uitgevoerd.
            </p>
          </motion.footer>
        </div>
      </div>
    </div>
  );
}
