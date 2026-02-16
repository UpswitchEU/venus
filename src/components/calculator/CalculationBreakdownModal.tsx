'use client';

/**
 * Calculation Breakdown Modal
 * 
 * Shows detailed methodology and calculation steps for the valuation.
 * Provides transparency for accountants to verify the numbers.
 */

import { motion } from 'framer-motion';
import { springDefault } from '@/design-system/components/motion';
import { Calculator, TrendingUp, Scale, Info } from 'lucide-react';
import { cn } from '@/design-system/utils';
import { Modal, ModalContent, ModalHeader, ModalTitle, AuroraButton } from '@/design-system';

export interface CalculationBreakdownModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report?: {
    companyName: string;
    valuation: number;
    ebitda: number;
    multiple: number;
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

export function CalculationBreakdownModal({
  open,
  onOpenChange,
  report,
}: CalculationBreakdownModalProps) {
  if (!report) return null;

  const steps = [
    {
      icon: Calculator,
      label: 'Genormaliseerde EBITDA',
      value: formatCurrency(report.ebitda),
      description: 'EBITDA na correctie voor eenmalige en niet-operationele kosten',
    },
    {
      icon: TrendingUp,
      label: 'Sector Multiple',
      value: `${report.multiple.toFixed(1)}x`,
      description: 'Gebaseerd op vergelijkbare transacties in de sector',
    },
    {
      icon: Scale,
      label: 'Ondernemingswaarde',
      value: formatCurrency(report.valuation),
      description: 'EBITDA × Multiple = Enterprise Value',
      highlight: true,
    },
  ];

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-lg">
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2">
            <Info className="w-5 h-5 text-primary" />
            Berekeningsdetails
          </ModalTitle>
        </ModalHeader>

        <div className="py-4 space-y-4">
          <div className="px-4 py-3 rounded-lg bg-foreground/[0.02] border border-foreground/[0.06]">
            <p className="text-xs text-foreground/50 uppercase tracking-wider">Bedrijf</p>
            <p className="text-sm font-medium text-foreground mt-0.5">{report.companyName}</p>
          </div>

          <div className="space-y-3">
            {steps.map((step, index) => (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...springDefault, delay: index * 0.1 }}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg transition-colors",
                  step.highlight 
                    ? "bg-primary/5 border border-primary/20" 
                    : "bg-foreground/[0.02]"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  step.highlight ? "bg-primary/10" : "bg-foreground/[0.06]"
                )}>
                  <step.icon className={cn("w-4 h-4", step.highlight ? "text-primary" : "text-foreground/50")} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground/70">{step.label}</span>
                    <span className={cn(
                      "font-mono text-sm font-semibold",
                      step.highlight ? "text-primary" : "text-foreground"
                    )}>
                      {step.value}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/40 mt-0.5">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="px-4 py-3 rounded-lg bg-muted/50 border border-foreground/[0.06]">
            <p className="text-xs text-foreground/50 mb-2">Formule</p>
            <code className="text-sm font-mono text-foreground">
              {formatCurrency(report.ebitda)} × {report.multiple.toFixed(1)} = {formatCurrency(report.valuation)}
            </code>
          </div>

          <p className="text-xs text-foreground/40 px-1">
            De multiple is bepaald op basis van recente transacties van vergelijkbare bedrijven in dezelfde sector, 
            gecorrigeerd voor omvang, groeipotentieel en risicoprofiel.
          </p>
        </div>

        <div className="flex justify-end pt-2 border-t border-foreground/[0.06]">
          <AuroraButton variant="ghost" onClick={() => onOpenChange(false)}>
            Sluiten
          </AuroraButton>
        </div>
      </ModalContent>
    </Modal>
  );
}
