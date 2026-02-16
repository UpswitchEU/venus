/**
 * ✏️ Edit Choice Modal
 * Location: src/components/modals/EditChoiceModal.tsx
 * Purpose: Context-aware modal to choose what to edit when clicking edit on business card
 *
 * Shows when user clicks edit on business card.
 * Lets them choose: Edit Report OR Delete Report
 *
 * Uses design-system Modal (Aurora) for Clarity alignment.
 */

'use client'

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
} from '@/design-system'
import { Building2, Trash2 } from 'lucide-react'
import React from 'react'

interface EditChoiceModalProps {
  isOpen: boolean
  onClose: () => void
  onEditReport: () => void
  onDeleteReport?: () => void
  reportName?: string
}

const EditChoiceModal: React.FC<EditChoiceModalProps> = ({
  isOpen,
  onClose,
  onEditReport,
  onDeleteReport,
  reportName = 'this report',
}) => {
  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <ModalContent size="xl" showClose>
        <ModalHeader className="flex flex-col gap-1 border-b border-foreground/10 pb-4">
          <ModalTitle className="text-2xl font-bold text-foreground">
            What would you like to do?
          </ModalTitle>
          <ModalDescription className="text-sm text-foreground/60 font-normal mt-1">
            Choose an action for {reportName}
          </ModalDescription>
        </ModalHeader>
        <div className="py-6">
          <div className="space-y-4">
            {/* Edit Report Option */}
            <button
              onClick={() => {
                onEditReport()
                onClose()
              }}
              className="w-full group"
            >
              <div className="flex items-start gap-4 p-6 border-2 border-foreground/10 rounded-xl hover:border-primary hover:bg-primary/10 transition-all duration-200 text-left">
                <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground mb-1">Edit Report</h3>
                  <p className="text-sm text-foreground/60">
                    Update your valuation report: inputs, business information, and other details.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-foreground/5 text-xs text-foreground/60">
                      Business Info
                    </span>
                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-foreground/5 text-xs text-foreground/60">
                      Financial Data
                    </span>
                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-foreground/5 text-xs text-foreground/60">
                      Valuation Settings
                    </span>
                  </div>
                </div>
              </div>
            </button>

            {/* Delete Report Option */}
            {onDeleteReport && (
              <button
                onClick={() => {
                  onDeleteReport()
                  onClose()
                }}
                className="w-full group"
              >
                <div className="flex items-start gap-4 p-6 border-2 border-foreground/10 rounded-xl hover:border-destructive hover:bg-destructive/10 transition-all duration-200 text-left">
                  <div className="flex-shrink-0 w-12 h-12 bg-destructive/20 rounded-lg flex items-center justify-center group-hover:bg-destructive/30 transition-colors">
                    <Trash2 className="w-6 h-6 text-destructive" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-foreground mb-1">Delete Report</h3>
                    <p className="text-sm text-foreground/60">
                      Permanently delete {reportName} and all associated data. This action cannot be
                      undone.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-destructive/10 text-xs text-foreground">
                        Permanent
                      </span>
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-destructive/10 text-xs text-foreground">
                        Cannot Undo
                      </span>
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-destructive/10 text-xs text-foreground">
                        All Data Lost
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            )}

            {/* Info Message */}
            <div className="mt-4 p-4 bg-primary/10 border border-primary/20 rounded-lg">
              <p className="text-sm text-foreground/60">
                <strong>Tip:</strong> Editing a report allows you to update business information and
                recalculate the valuation. Deleting permanently removes all data.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-foreground/10">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-foreground/60 bg-background border border-foreground/10 rounded-md hover:bg-foreground/5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  )
}

export default EditChoiceModal
