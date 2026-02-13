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

// Sample EBITDA adjustments for demo
const ebitdaAdjustments: Array<{
  id: string;
  label: string;
  value: number;
  type: 'base' | 'add' | 'subtract' | 'result';
  description?: string;
}> = [
  { id: '1', label: 'Gerapporteerde EBITDA', value: 680000, type: 'base' },
  { id: '2', label: 'Eigenaarssalaris normalisatie', value: 60000, type: 'add', description: 'Aanpassing naar marktconform salaris' },
  { id: '3', label: 'Eenmalige marketingkosten', value: 25000, type: 'add', description: 'Niet-terugkerende campagnekosten' },
  { id: '4', label: 'Privékosten directie', value: 18000, type: 'add', description: 'Auto en representatie' },
  { id: '5', label: 'Genormaliseerde EBITDA', value: 783000, type: 'result' },
];

export function CalculationBreakdownPanel({
  report,
}: CalculationBreakdownPanelProps) {
  if (!report) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-background">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Geen berekening beschikbaar</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Vul de bedrijfsgegevens in en bereken de schatting om de berekeningsdetails te zien.
          </p>
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
            <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
              <Calculator className="w-4 h-4 text-teal-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Berekeningsdetails</h2>
          </div>
          <p className="text-sm text-slate-500 ml-10">
            Volledige transparantie over de schattingsmethodologie voor {report.companyName}
          </p>
        </motion.div>

        {/* EBITDA Waterfall / Bridge */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-400" />
            EBITDA Normalisatie Bridge
          </h3>
          
          <div className="bg-slate-50 rounded-xl p-4 space-y-2">
            {ebitdaAdjustments.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + index * 0.05 }}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg",
                  item.type === 'base' && "bg-white border border-slate-200",
                  item.type === 'add' && "bg-white border-l-4 border-l-emerald-400",
                  item.type === 'subtract' && "bg-white border-l-4 border-l-rose-400",
                  item.type === 'result' && "bg-teal-600 text-white"
                )}
              >
                {/* Icon */}
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                  item.type === 'base' && "bg-slate-100",
                  item.type === 'add' && "bg-emerald-100",
                  item.type === 'subtract' && "bg-rose-100",
                  item.type === 'result' && "bg-white/20"
                )}>
                  {item.type === 'base' && <Equal className="w-3 h-3 text-slate-500" />}
                  {item.type === 'add' && <Plus className="w-3 h-3 text-emerald-600" />}
                  {item.type === 'subtract' && <Minus className="w-3 h-3 text-rose-600" />}
                  {item.type === 'result' && <Equal className="w-3 h-3 text-white" />}
                </div>

                {/* Label & Description */}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-medium",
                    item.type === 'result' ? "text-white" : "text-slate-900"
                  )}>
                    {item.label}
                  </p>
                  {item.description && (
                    <p className="text-xs text-slate-400">{item.description}</p>
                  )}
                </div>

                {/* Value */}
                <span className={cn(
                  "font-mono text-sm font-semibold tabular-nums shrink-0",
                  item.type === 'add' && "text-emerald-600",
                  item.type === 'subtract' && "text-rose-600",
                  item.type === 'base' && "text-slate-700",
                  item.type === 'result' && "text-white"
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
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            Indicatieve Berekening
          </h3>

          <div className="grid grid-cols-3 gap-4">
            {/* EBITDA */}
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Genorm. EBITDA</p>
              <p className="text-xl font-bold font-mono text-slate-900">{formatCurrency(report.ebitda)}</p>
            </div>

            {/* Times symbol */}
            <div className="flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
                <span className="text-teal-600 text-lg font-bold">×</span>
              </div>
            </div>

            {/* Multiple with explanation */}
            <div className="bg-slate-50 rounded-xl p-4 text-center relative group">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Sector Multiple</p>
              <p className="text-xl font-bold font-mono text-slate-900">{report.multiple.toFixed(1)}x</p>
              <div className="absolute left-0 right-0 -bottom-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[10px] bg-slate-700 text-white px-2 py-0.5 rounded-full">
                  Industrial Manufacturing
                </span>
              </div>
            </div>
          </div>

          {/* Equals */}
          <div className="flex items-center justify-center my-4">
            <ArrowRight className="w-5 h-5 text-slate-300" />
          </div>

          {/* Result */}
          <div className="bg-gradient-to-r from-teal-600 to-teal-500 rounded-xl p-6 text-center text-white">
            <p className="text-xs text-teal-100 uppercase tracking-wider mb-1">Ondernemingswaarde</p>
            <p className="text-3xl font-bold font-mono">{formatCurrency(report.valuation)}</p>
            <p className="text-xs text-teal-200 mt-2">
              Bereik: {formatCurrency(valuationLow)} – {formatCurrency(valuationHigh)}
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
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-slate-400" />
            Waarom deze Multiple?
          </h3>

          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex gap-3">
                <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-amber-900 font-medium">Sector: Industrial Manufacturing • 5.0× – 6.0× bereik</p>
                  <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                    Manufacturing bedrijven in België met €1-5M omzet worden typisch gewaardeerd tegen 5.0×-6.0× EBITDA. 
                    De 5.5× is gebaseerd op recente transacties en houdt rekening met:
                  </p>
                  <ul className="text-xs text-amber-700 mt-2 space-y-1">
                    <li className="flex items-start gap-1.5">
                      <span className="text-amber-500">•</span>
                      <span><strong>Omvangpremie:</strong> Kleinere bedrijven (&lt;€5M omzet) krijgen lagere multiples vanwege concentratierisico</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-amber-500">•</span>
                      <span><strong>Eigenaar-afhankelijkheid:</strong> 2 eigenaar-managers betekent beperkte afhankelijkheid (-0.2×)</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-amber-500">•</span>
                      <span><strong>Sector stabiliteit:</strong> Manufacturing is minder volatiel dan tech (+0.3×)</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>Bronnen:</strong> Damodaran Dataset 2024, PitchBook Benelux, BDO M&A Monitor. 
                De methodologie volgt de Koller/McKinsey 'Valuation' benadering 
                met aanpassingen voor SME-context.
              </p>
            </div>
          </div>
        </motion.section>

        {/* Comparables (mini table) */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Scale className="w-4 h-4 text-slate-400" />
            Vergelijkbare Transacties
          </h3>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600 uppercase">Bedrijf</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-slate-600 uppercase">Multiple</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-slate-600 uppercase">Omzet</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-slate-600 uppercase">Datum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { company: 'Vergelijkbaar A (Geanonimiseerd)', multiple: 5.8, revenue: 1500000, date: '2025-Q3' },
                  { company: 'Vergelijkbaar B (Geanonimiseerd)', multiple: 5.2, revenue: 850000, date: '2025-Q2' },
                  { company: 'Vergelijkbaar C (Geanonimiseerd)', multiple: 5.5, revenue: 1200000, date: '2025-Q1' },
                ].map((comp, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-slate-700">{comp.company}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-900">{comp.multiple.toFixed(1)}x</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{formatCurrency(comp.revenue)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{comp.date}</td>
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
