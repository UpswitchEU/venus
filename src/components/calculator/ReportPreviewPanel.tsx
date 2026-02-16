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
          className="relative bg-gradient-to-br from-foreground/95 via-foreground/90 to-foreground/95 text-background overflow-hidden"
        >
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/80 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 px-8 py-12">
            <div className="flex items-center justify-between mb-12">
              <span className="text-sm font-semibold text-background/80 tracking-wider">UPSWITCH</span>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/20 border border-primary/30">
                <CheckCircle2 className="w-3 h-3 text-primary" />
                <span className="text-[10px] font-medium text-primary/90 uppercase tracking-wider">Concept Rapport</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] mb-4">Indicatieve Bedrijfsschatting</p>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">{report.companyName}</h1>

            <div className="bg-background/5 backdrop-blur-sm rounded-2xl border border-foreground/10 p-6 mb-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Geschatte Ondernemingswaarde</p>
              <div className="flex items-baseline gap-4">
                <span className="text-5xl md:text-6xl font-bold font-mono tabular-nums text-primary">
                  {formatCurrency(report.valuation)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                Bereik: {formatCurrency(valuationLow)} – {formatCurrency(valuationHigh)}
              </p>
            </div>

            <div className="flex gap-6 text-sm">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider">EBITDA</p>
                <p className="font-semibold font-mono text-background">{formatCurrency(report.ebitda)}</p>
              </div>
              <div className="w-px bg-background/10" />
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider">Multiple</p>
                <p className="font-semibold font-mono text-background">{report.multiple.toFixed(1)}x</p>
              </div>
              <div className="w-px bg-background/10" />
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wider">Datum</p>
                <p className="font-semibold text-background">
                  {report.generatedAt.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="px-8 py-8 space-y-8">
          {report.metrics && report.metrics.length > 0 && (
            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springDefault, delay: 0.1 }}>
              <h2 className="text-sm font-semibold text-foreground/80 uppercase tracking-wider mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
                Kerncijfers
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {report.metrics.map((metric, index) => (
                  <motion.div
                    key={metric.label}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...springDefault, delay: 0.15 + index * 0.03 }}
                    className="bg-muted rounded-xl p-4 hover:bg-foreground/5 transition-colors"
                  >
                    <p className="text-xs text-muted-foreground mb-1">{metric.label}</p>
                    <div className="flex items-end justify-between">
                      <span className="text-lg font-bold text-foreground font-mono tabular-nums">{metric.value}</span>
                      {metric.change !== undefined && (
                        <span className={cn(
                          "flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded",
                          metric.change >= 0 ? "text-success bg-success/10" : "text-destructive bg-destructive/10"
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

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springDefault, delay: 0.3 }} className="bg-primary/10 border border-primary/20 rounded-xl p-5">
            <div className="flex gap-3">
              <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Methodologie</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Deze indicatieve bedrijfsschatting is gebaseerd op vergelijkbare transactieanalyse met 
                  sectorspecifieke EBITDA-multiples (Damodaran). Het bereik houdt rekening met 
                  huidige marktomstandigheden, bedrijfsspecifieke risicofactoren en groeitraject.
                </p>
              </div>
            </div>
          </motion.section>

          <motion.footer initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...springDefault, delay: 0.4 }} className="text-[10px] text-muted-foreground border-t border-foreground/10 pt-6 leading-relaxed">
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
