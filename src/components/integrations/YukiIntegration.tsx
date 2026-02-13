'use client';

/**
 * Accounting Integration Components
 * 
 * CSV-first integration UI for importing accounting software exports.
 * Supports Yuki, Exact, and Odoo file formats.
 * Direct API integrations planned for 2025.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/design-system/utils';
import { AuroraButton as Button } from '@/design-system/components/Button';
import { Badge } from '@/design-system/components/Badge';
import { GlassCard } from '@/design-system/components/GlassCard';
import { Heading, Body, Caption, Mono } from '@/design-system/components/Typography';
import { 
  Check, 
  RefreshCw, 
  AlertCircle, 
  ChevronRight,
  X,
  FileSpreadsheet,
  Upload,
  Download
} from 'lucide-react';

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface ImportStatus {
  status: 'none' | 'processing' | 'imported' | 'error';
  lastImport?: Date;
  fileName?: string;
  errorMessage?: string;
}

export interface SuggestedNormalisation {
  id: string;
  category: string;
  description: string;
  amount: number;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface CSVImportCardProps {
  importStatus: ImportStatus;
  onUpload: () => void;
  onDownloadTemplate: () => void;
  onClearImport?: () => void;
  className?: string;
  softwareName?: 'Yuki' | 'Exact' | 'Odoo' | 'Generiek';
}

export interface NormalisationReviewProps {
  suggestions: SuggestedNormalisation[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onAcceptAll: () => void;
  className?: string;
}

// Legacy type exports for backward compatibility
export interface YukiConnectionStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastSync?: Date;
  errorMessage?: string;
}

export interface YukiConnectCardProps {
  connectionStatus: YukiConnectionStatus;
  onConnect: () => void;
  onResync?: () => void;
  onDisconnect?: () => void;
  className?: string;
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

const formatCurrency = (amount: number) => {
  if (amount >= 1000) return `€${(amount / 1000).toFixed(1)}K`;
  return `€${amount.toFixed(0)}`;
};

const formatImportTime = (date: Date, locale: 'en' | 'nl' = 'nl') => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  
  if (locale === 'nl') {
    if (minutes < 1) return 'Zojuist';
    if (minutes < 60) return `${minutes}m geleden`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}u geleden`;
    return date.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
  } else {
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
};

// ─────────────────────────────────────────
// CSV IMPORT CARD (Primary Component)
// ─────────────────────────────────────────

export function CSVImportCard({
  importStatus,
  onUpload,
  onDownloadTemplate,
  onClearImport,
  className,
  softwareName = 'Generiek',
}: CSVImportCardProps) {
  const { status, lastImport, fileName, errorMessage } = importStatus;
  
  const softwareColors: Record<string, string> = {
    Yuki: '#00A4E4',
    Exact: '#E94E1B',
    Odoo: '#714B67',
    Generiek: 'hsl(var(--primary))',
  };
  
  const color = softwareColors[softwareName];

  return (
    <GlassCard className={cn("p-6", className)}>
      <div className="flex items-start gap-4">
        {/* Software Icon */}
        <div 
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}15` }}
        >
          <FileSpreadsheet className="w-6 h-6" style={{ color }} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <Heading level={3} className="text-lg">{softwareName} Export</Heading>
            {status === 'imported' && (
              <Badge variant="primary" size="sm">Geïmporteerd</Badge>
            )}
            {status === 'error' && (
              <Badge variant="accent" size="sm">Fout</Badge>
            )}
          </div>

          {/* Status Description */}
          {status === 'none' && (
            <Body size="sm" className="text-foreground/50 mb-4">
              Upload een grootboekexport (CSV) om rekeningen te categoriseren.
            </Body>
          )}
          
          {status === 'processing' && (
            <Body size="sm" className="text-foreground/50 mb-4">
              Bestand verwerken...
            </Body>
          )}
          
          {status === 'imported' && lastImport && (
            <div className="mb-4">
              {fileName && (
                <Caption className="text-foreground/60 mb-1">
                  {fileName}
                </Caption>
              )}
              <Caption className="text-foreground/40">
                Geïmporteerd: {formatImportTime(lastImport)}
              </Caption>
            </div>
          )}
          
          {status === 'error' && (
            <div className="flex items-start gap-2 mb-4">
              <AlertCircle className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
              <Body size="sm" className="text-secondary">
                {errorMessage || 'Het bestand kon niet worden verwerkt. Controleer het formaat.'}
              </Body>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            {status === 'none' && (
              <>
                <Button variant="primary" size="sm" className="gap-2" onClick={onUpload}>
                  <Upload className="w-4 h-4" />
                  Upload CSV
                </Button>
                <Button variant="ghost" size="sm" className="gap-2" onClick={onDownloadTemplate}>
                  <Download className="w-4 h-4" />
                  Template
                </Button>
              </>
            )}
            
            {status === 'imported' && (
              <>
                <Button variant="secondary" size="sm" className="gap-2" onClick={onUpload}>
                  <RefreshCw className="w-4 h-4" />
                  Nieuw bestand
                </Button>
                {onClearImport && (
                  <Button variant="ghost" size="sm" onClick={onClearImport}>
                    Wissen
                  </Button>
                )}
              </>
            )}
            
            {status === 'error' && (
              <>
                <Button variant="primary" size="sm" className="gap-2" onClick={onUpload}>
                  <RefreshCw className="w-4 h-4" />
                  Opnieuw proberen
                </Button>
                <Button variant="ghost" size="sm" className="gap-2" onClick={onDownloadTemplate}>
                  <Download className="w-4 h-4" />
                  Template
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

// ─────────────────────────────────────────
// YUKI CONNECT CARD (Legacy - maps to CSV flow)
// ─────────────────────────────────────────

export function YukiConnectCard({
  connectionStatus,
  onConnect,
  onResync,
  onDisconnect,
  className,
}: YukiConnectCardProps) {
  // Map legacy connection status to import status
  const importStatus: ImportStatus = {
    status: connectionStatus.status === 'connected' ? 'imported' : 
            connectionStatus.status === 'connecting' ? 'processing' :
            connectionStatus.status === 'error' ? 'error' : 'none',
    lastImport: connectionStatus.lastSync,
    errorMessage: connectionStatus.errorMessage,
  };

  return (
    <CSVImportCard
      importStatus={importStatus}
      onUpload={onConnect}
      onDownloadTemplate={() => {}}
      onClearImport={onDisconnect}
      className={className}
      softwareName="Yuki"
    />
  );
}

// Legacy alias for backward compatibility
const formatSyncTime = formatImportTime;

// ─────────────────────────────────────────
// IMPORT STATUS BADGE
// ─────────────────────────────────────────

export function ImportStatusBadge({ 
  status, 
  lastImport 
}: { 
  status: ImportStatus['status']; 
  lastImport?: Date;
}) {
  if (status === 'processing') {
    return (
      <div className="flex items-center gap-2 text-sm text-foreground/50">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span>Verwerken...</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2 text-sm text-secondary">
        <AlertCircle className="w-4 h-4" />
        <span>Import mislukt</span>
      </div>
    );
  }

  if (status === 'imported' && lastImport) {
    return (
      <div className="flex items-center gap-2 text-sm text-primary">
        <Check className="w-4 h-4" />
        <span>Geïmporteerd {formatImportTime(lastImport)}</span>
      </div>
    );
  }

  return null;
}

// Legacy component alias
export function SyncStatusBadge({ 
  status, 
  lastSync 
}: { 
  status: YukiConnectionStatus['status']; 
  lastSync?: Date;
}) {
  const mappedStatus: ImportStatus['status'] = 
    status === 'connected' ? 'imported' : 
    status === 'connecting' ? 'processing' :
    status === 'error' ? 'error' : 'none';
  
  return <ImportStatusBadge status={mappedStatus} lastImport={lastSync} />;
}

// ─────────────────────────────────────────
// NORMALISATION REVIEW PANEL
// ─────────────────────────────────────────

export function NormalisationReviewPanel({
  suggestions,
  onAccept,
  onReject,
  onAcceptAll,
  className,
}: NormalisationReviewProps) {
  const pendingCount = suggestions.filter(s => s.status === 'pending').length;
  const acceptedCount = suggestions.filter(s => s.status === 'accepted').length;

  return (
    <GlassCard className={cn("p-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Heading level={3} className="text-lg mb-1">Voorgestelde Normalisaties</Heading>
          <Caption className="text-foreground/50">
            {pendingCount > 0 
              ? `${pendingCount} normalisaties te beoordelen`
              : `${acceptedCount} normalisaties geaccepteerd`
            }
          </Caption>
        </div>
        
        {pendingCount > 0 && (
          <Button variant="primary" size="sm" onClick={onAcceptAll}>
            Alles accepteren
          </Button>
        )}
      </div>

      {/* Suggestions List */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {suggestions.map((suggestion) => (
            <motion.div
              key={suggestion.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={cn(
                "flex items-start gap-4 p-4 rounded-xl",
                "border transition-all",
                suggestion.status === 'pending' 
                  ? "bg-foreground/[0.02] border-foreground/[0.06]"
                  : suggestion.status === 'accepted'
                    ? "bg-primary/5 border-primary/20"
                    : "bg-foreground/[0.01] border-foreground/[0.04] opacity-50"
              )}
            >
              {/* Amount */}
              <div className="w-20 shrink-0">
                <Mono className="text-lg font-semibold text-primary">
                  {formatCurrency(suggestion.amount)}
                </Mono>
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <Body size="sm" className="font-medium mb-0.5">
                  {suggestion.category}
                </Body>
                <Caption className="text-foreground/50 line-clamp-2">
                  {suggestion.reason}
                </Caption>
              </div>

              {/* Actions */}
              {suggestion.status === 'pending' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onReject(suggestion.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-foreground/[0.06] transition-colors"
                    aria-label="Afwijzen"
                  >
                    <X className="w-4 h-4 text-foreground/40" />
                  </button>
                  <button
                    onClick={() => onAccept(suggestion.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 hover:bg-primary/20 transition-colors"
                    aria-label="Accepteren"
                  >
                    <Check className="w-4 h-4 text-primary" />
                  </button>
                </div>
              )}

              {/* Status Badges */}
              {suggestion.status === 'accepted' && (
                <Badge variant="primary" size="sm">Geaccepteerd</Badge>
              )}
              {suggestion.status === 'rejected' && (
                <Badge variant="neutral" size="sm">Afgewezen</Badge>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </GlassCard>
  );
}

// ─────────────────────────────────────────
// MAPPING TABLE (GROOTBOEK CODES)
// ─────────────────────────────────────────

export interface MappingRow {
  yukiCode: string;
  yukiDescription: string;
  mappedTo: string;
  category: 'revenue' | 'expense' | 'asset' | 'liability';
}

export function MappingTable({ 
  mappings,
  className,
}: { 
  mappings: MappingRow[];
  className?: string;
}) {
  return (
    <GlassCard className={cn("overflow-hidden", className)}>
      <div className="px-6 py-4 border-b border-foreground/[0.06]">
        <Heading level={3} className="text-lg">Grootboek Mapping</Heading>
        <Caption className="text-foreground/50">
          {mappings.length} rekeningen gematcht
        </Caption>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-foreground/[0.06]">
              <th className="px-6 py-3 text-left text-xs font-medium text-foreground/40 uppercase tracking-wider">
                Yuki Code
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-foreground/40 uppercase tracking-wider">
                Omschrijving
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-foreground/40 uppercase tracking-wider">
                Categorie
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-foreground/40 uppercase tracking-wider">
                Gematcht naar
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/[0.04]">
            {mappings.map((mapping, index) => (
              <tr key={index} className="hover:bg-foreground/[0.02] transition-colors">
                <td className="px-6 py-3">
                  <Mono size="sm" className="text-foreground/70">
                    {mapping.yukiCode}
                  </Mono>
                </td>
                <td className="px-6 py-3">
                  <Body size="sm" className="text-foreground/70 truncate max-w-xs">
                    {mapping.yukiDescription}
                  </Body>
                </td>
                <td className="px-6 py-3">
                  <Badge 
                    variant={
                      mapping.category === 'revenue' ? 'primary' :
                      mapping.category === 'expense' ? 'accent' :
                      'neutral'
                    } 
                    size="sm"
                  >
                    {mapping.category === 'revenue' ? 'Omzet' :
                     mapping.category === 'expense' ? 'Kosten' :
                     mapping.category === 'asset' ? 'Activa' : 'Passiva'}
                  </Badge>
                </td>
                <td className="px-6 py-3">
                  <Body size="sm" className="text-foreground">
                    {mapping.mappedTo}
                  </Body>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

// ─────────────────────────────────────────
// FALLBACK MANUAL INPUT CTA
// ─────────────────────────────────────────

export function ManualInputFallback({
  onManualInput,
  className,
}: {
  onManualInput: () => void;
  className?: string;
}) {
  return (
    <div className={cn(
      "flex items-center justify-between p-4 rounded-xl",
      "bg-foreground/[0.02] border border-dashed border-foreground/[0.10]",
      className
    )}>
      <div>
        <Body size="sm" className="font-medium mb-0.5">
          Geen boekhoudpakket?
        </Body>
        <Caption className="text-foreground/40">
          Voer uw financiële gegevens handmatig in.
        </Caption>
      </div>
      <Button variant="secondary" size="sm" onClick={onManualInput}>
        Handmatig invoeren
        <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  );
}
