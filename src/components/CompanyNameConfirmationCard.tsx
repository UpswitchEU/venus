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
          <div className="flex-shrink-0 w-8 h-8 bg-primary-500/20 rounded-full flex items-center justify-center border border-primary-500/30 shadow-lg shadow-primary-500/10 mt-1">
            <CheckCircle2 className="w-4 h-4 text-primary-400" />
          </div>

          <div className="flex flex-col gap-1 w-full">
            {/* Main Confirmation Card */}
            <div className="rounded-2xl rounded-tl-sm overflow-hidden border border-primary-500/20 shadow-lg backdrop-blur-sm bg-zinc-900/40">
              {/* Header with gradient */}
              <div className="px-5 py-3 bg-gradient-to-r from-primary-900/20 to-transparent border-b border-primary-500/10 flex items-center justify-between">
                <span className="text-xs font-semibold text-primary-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse"></span>
                  Verified Company
                </span>
              </div>

              {/* Content */}
              <div className="p-5">
                <div className="flex items-start gap-4">
                  {/* Icon Box */}
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700/50 flex items-center justify-center text-2xl shadow-inner">
                    🏢
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white leading-tight mb-1">
                      {companyName}
                    </h3>

                    {/* KBO Details Badges */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {registrationNumber && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800/50 border border-zinc-700/50 text-xs font-medium text-zinc-300">
                          <FileText className="w-3 h-3 text-zinc-400" />
                          Registration: {registrationNumber}
                        </div>
                      )}

                      {legalForm && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800/50 border border-zinc-700/50 text-xs font-medium text-zinc-300">
                          <Building2 className="w-3 h-3 text-zinc-400" />
                          Type: {legalForm}
                        </div>
                      )}

                      {foundingYear && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800/50 border border-zinc-700/50 text-xs font-medium text-zinc-300">
                          <Calendar className="w-3 h-3 text-zinc-400" />
                          Founded: {foundingYear}
                        </div>
                      )}

                      {industryDescription && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800/50 border border-zinc-700/50 text-xs font-medium text-zinc-300">
                          <Building2 className="w-3 h-3 text-zinc-400" />
                          {industryDescription}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Confirmation Text */}
                <div className="mt-4 pt-3 border-t border-white/5 text-sm text-zinc-400 leading-relaxed">
                  We've successfully verified your company in the KBO registry.
                </div>
              </div>
            </div>

            {/* Timestamp */}
            {timestamp && (
              <div className="text-xs text-zinc-500 ml-1 flex items-center gap-1">
                <span className="text-primary-500/50">●</span>
                {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
