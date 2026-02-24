'use client';

/**
 * Data Completeness Ring
 * 
 * Stripe-inspired progress indicator showing data completeness.
 * Persistent in nav to show accountants their progress.
 */

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Check, AlertCircle } from 'lucide-react';
import { cn } from '@/design-system/utils';
import { Tooltip } from '@/design-system';

export interface DataField {
  id: string;
  label: string;
  completed: boolean;
  required?: boolean;
  source?: 'kbo' | 'manual' | 'ai' | 'csv';
}

export interface DataCompletenessRingProps {
  fields: DataField[];
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizeConfig = {
  sm: { ring: 32, stroke: 3, text: 'text-[10px]', icon: 10 },
  md: { ring: 40, stroke: 4, text: 'text-xs', icon: 12 },
  lg: { ring: 56, stroke: 5, text: 'text-sm', icon: 16 },
};

export function DataCompletenessRing({ 
  fields, 
  className,
  showLabel = true,
  size = 'md',
}: DataCompletenessRingProps) {
  const t = useTranslations('dataCompleteness')
  const totalFields = fields.length;
  const completedFields = fields.filter(f => f.completed).length;
  const percentage = totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0;
  const requiredIncomplete = fields.filter(f => f.required && !f.completed);
  
  const config = sizeConfig[size];
  const radius = (config.ring - config.stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  
  const isComplete = percentage === 100;
  const hasIssues = requiredIncomplete.length > 0;

  const tooltipContent = (
    <div className="w-56">
      <div className="p-3 border-b border-foreground/[0.06]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">{t('title')}</span>
          <span className={cn(
            "text-xs font-semibold",
            isComplete ? "text-primary" : hasIssues ? "text-warning" : "text-primary"
          )}>
            {percentage}%
          </span>
        </div>
        <div className="mt-2 h-1.5 bg-foreground/[0.08] rounded-full overflow-hidden">
          <motion.div
            className={cn(
              "h-full rounded-full",
              isComplete ? "bg-success" : hasIssues ? "bg-warning" : "bg-primary"
            )}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ type: 'spring', stiffness: 170, damping: 26 }}
          />
        </div>
      </div>
      <div className="p-2 max-h-48 overflow-y-auto space-y-1">
        {fields.map((field) => (
          <div 
            key={field.id}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs",
              field.completed 
                ? "text-foreground/60" 
                : field.required 
                  ? "bg-warning/5 text-warning" 
                  : "text-foreground/40"
            )}
          >
            {field.completed ? (
              <Check className="w-3 h-3 text-primary shrink-0" />
            ) : field.required ? (
              <AlertCircle className="w-3 h-3 shrink-0" />
            ) : (
              <div className="w-3 h-3 rounded-full border border-foreground/20 shrink-0" />
            )}
            <span className="flex-1 truncate">{field.label}</span>
            {field.source && field.completed && (
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded font-medium",
                field.source === 'kbo' && "bg-success/10 text-success",
                field.source === 'csv' && "bg-warning/10 text-warning",
                field.source === 'ai' && "bg-primary/10 text-primary",
                field.source === 'manual' && "bg-foreground/[0.06] text-foreground/50"
              )}>
                {field.source.toUpperCase()}
              </span>
            )}
          </div>
        ))}
      </div>
      {requiredIncomplete.length > 0 && (
        <div className="p-2 border-t border-foreground/[0.06] bg-warning/[0.02]">
          <p className="text-[10px] text-warning">
            {t('requiredFieldsMissing', { count: requiredIncomplete.length })}
          </p>
        </div>
      )}
    </div>
  );

  return (
    <Tooltip content={tooltipContent} side="bottom">
      <div className={cn("flex items-center gap-2 cursor-default", className)}>
        <div className="relative" style={{ width: config.ring, height: config.ring }}>
          <svg
            className="absolute inset-0 -rotate-90"
            width={config.ring}
            height={config.ring}
          >
            <circle
              cx={config.ring / 2}
              cy={config.ring / 2}
              r={radius}
              fill="none"
              stroke="hsl(var(--foreground) / 0.08)"
              strokeWidth={config.stroke}
            />
            <motion.circle
              cx={config.ring / 2}
              cy={config.ring / 2}
              r={radius}
              fill="none"
              stroke={isComplete ? "hsl(var(--success))" : hasIssues ? "hsl(var(--warning))" : "hsl(var(--primary))"}
              strokeWidth={config.stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ type: 'spring', stiffness: 170, damping: 26 }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {isComplete ? (
              <Check className="text-primary" style={{ width: config.icon, height: config.icon }} />
            ) : hasIssues ? (
              <AlertCircle className="text-warning" style={{ width: config.icon, height: config.icon }} />
            ) : (
              <span className={cn("font-semibold font-mono text-foreground", config.text)}>
                {percentage}
              </span>
            )}
          </div>
        </div>
        {showLabel && (
          <div className="hidden sm:block">
            <p className={cn(
              "font-medium text-foreground leading-tight",
              size === 'sm' ? 'text-[10px]' : size === 'md' ? 'text-xs' : 'text-sm'
            )}>
              {isComplete ? t('complete') : `${completedFields}/${totalFields}`}
            </p>
            {!isComplete && (
              <p className={cn("text-foreground/50", size === 'sm' ? 'text-[9px]' : 'text-[10px]')}>
                {t('dataFilled')}
              </p>
            )}
          </div>
        )}
      </div>
    </Tooltip>
  );
}
