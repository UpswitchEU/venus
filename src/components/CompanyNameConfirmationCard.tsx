/**
 * Company Name Confirmation Card
 *
 * Displays a visual confirmation when a company name is successfully verified in the KBO registry.
 * Provides immediate feedback to the user that their company was found and verified.
 */

import { motion } from 'framer-motion'
import { Building2, Calendar, CheckCircle2, FileText } from 'lucide-react'
import React from 'react'

export interface CompanyNameConfirmationCardProps {
  companyName: string
  registrationNumber?: string
  legalForm?: string
  foundingYear?: number
  industryDescription?: string
  confidence?: number
  timestamp?: Date
}

export const CompanyNameConfirmationCard: React.FC<CompanyNameConfirmationCardProps> = ({
  companyName,
  registrationNumber,
  legalForm,
  foundingYear,
  industryDescription,
  confidence: _confidence,
  timestamp,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="flex justify-start w-full my-2"
    >
      <div className="max-w-[85%] mr-auto w-full">
        <div className="flex items-start gap-3">
          {/* Success Avatar */}
          <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20 shadow-lg shadow-primary/10 mt-1">
            <CheckCircle2 className="w-4 h-4 text-primary" />
          </div>

          <div className="flex flex-col gap-1 w-full">
            {/* Main Confirmation Card */}
            <div className="rounded-2xl rounded-tl-sm overflow-hidden border border-primary/20 shadow-lg backdrop-blur-sm bg-muted/40">
              {/* Header with gradient */}
              <div className="px-5 py-3 bg-gradient-to-r from-primary/20 to-transparent border-b border-primary/10 flex items-center justify-between">
                <span className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                  Verified Company
                </span>
              </div>

              {/* Content */}
              <div className="p-5">
                <div className="flex items-start gap-4">
                  {/* Icon Box */}
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-muted to-background border border-foreground/20 flex items-center justify-center text-2xl shadow-inner">
                    🏢
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-foreground leading-tight mb-1">
                      {companyName}
                    </h3>

                    {/* KBO Details Badges */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {registrationNumber && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 border border-foreground/20 text-xs font-medium text-muted-foreground">
                          <FileText className="w-3 h-3 text-muted-foreground" />
                          Registration: {registrationNumber}
                        </div>
                      )}

                      {legalForm && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 border border-foreground/20 text-xs font-medium text-muted-foreground">
                          <Building2 className="w-3 h-3 text-muted-foreground" />
                          Type: {legalForm}
                        </div>
                      )}

                      {foundingYear && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 border border-foreground/20 text-xs font-medium text-muted-foreground">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          Founded: {foundingYear}
                        </div>
                      )}

                      {industryDescription && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 border border-foreground/20 text-xs font-medium text-muted-foreground">
                          <Building2 className="w-3 h-3 text-muted-foreground" />
                          {industryDescription}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Confirmation Text */}
                <div className="mt-4 pt-3 border-t border-foreground/5 text-sm text-muted-foreground leading-relaxed">
                  We've successfully verified your company in the KBO registry.
                </div>
              </div>
            </div>

            {/* Timestamp */}
            {timestamp && (
              <div className="text-xs text-muted-foreground ml-1 flex items-center gap-1">
                <span className="text-primary/50">●</span>
                {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
