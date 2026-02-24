/**
 * Data Collection Component
 *
 * Simplified data collection for business valuation.
 * Handles basic form inputs for manual valuation flows.
 */

'use client'

import React, { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { BUSINESS_DATA_FIELDS, DataResponse, FieldValue } from '../../types/data-collection'
import { FieldRenderer } from './FieldRenderer'

interface DataCollectionProps {
  method?: 'manual_form'
  onDataCollected: (responses: DataResponse[]) => void
  onProgressUpdate?: (progress: {
    overallProgress: number
    completedFields: number
    totalFields: number
  }) => void
  onComplete?: (responses: DataResponse[]) => void
  initialData?: Partial<Record<string, any>>
  disabled?: boolean
  className?: string
}

export const DataCollection: React.FC<DataCollectionProps> = ({
  method = 'manual_form',
  onDataCollected,
  onProgressUpdate,
  onComplete,
  initialData = {},
  disabled = false,
  className = '',
}) => {
  const t = useTranslations()
  // Simple state for collected responses
  const [responses, setResponses] = useState<Map<string, DataResponse>>(() => {
    const initialResponses = new Map<string, DataResponse>()

    // Pre-populate with initial data
    Object.entries(initialData).forEach(([fieldId, value]) => {
      if (value !== undefined && value !== null) {
        const response: DataResponse = {
          fieldId,
          value,
          method: 'manual_form',
          confidence: 0.8,
          source: 'initial_data',
          timestamp: new Date(),
        }
        initialResponses.set(fieldId, response)
      }
    })

    return initialResponses
  })

  // Handle field value changes
  const handleFieldChange = useCallback(
    (fieldId: string, value: FieldValue) => {
      const response: DataResponse = {
        fieldId,
        value,
        method: 'manual_form',
        confidence: 1.0,
        source: 'user_input',
        timestamp: new Date(),
      }

      setResponses((prev) => {
        const newResponses = new Map(prev)
        newResponses.set(fieldId, response)
        return newResponses
      })

      // Notify parent of data collection
      const allResponses = Array.from(responses.values())
      allResponses.push(response) // Add current response
      onDataCollected?.(allResponses)

      // Calculate progress
      const fields = Object.values(BUSINESS_DATA_FIELDS)
      const completedFields = allResponses.length
      const totalFields = fields.length
      const progress = {
        overallProgress: completedFields / totalFields,
        completedFields,
        totalFields,
      }

      onProgressUpdate?.(progress)

      // Check if all required fields are complete
      const requiredFields = fields.filter((f) => f.required)
      const completedRequired = requiredFields.filter((f) =>
        allResponses.some((r) => r.fieldId === f.id && r.value !== undefined && r.value !== '')
      )

      if (completedRequired.length === requiredFields.length) {
        onComplete?.(allResponses)
      }
    },
    [responses, onDataCollected, onProgressUpdate, onComplete]
  )

  // Get fields to display
  const fields = Object.values(BUSINESS_DATA_FIELDS)
  const completedFields = responses.size
  const totalFields = fields.length

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Progress Indicator */}
      <div className="bg-muted/50 rounded-lg p-4 border border-foreground/10">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-white">{t('dataCollection.completeForm')}</h3>
          <span className="text-xs text-muted-foreground">
            {t('dataCollection.fieldsProgress', { completed: completedFields, total: totalFields })}
          </span>
        </div>

        <div className="w-full bg-muted rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${(completedFields / totalFields) * 100}%` }}
          />
        </div>
      </div>

      {/* Field Renderers */}
      <div className="space-y-4">
        {fields.map((field) => (
          <FieldRenderer
            key={field.id}
            field={field}
            value={responses.get(field.id)?.value}
            onChange={(value) => handleFieldChange(field.id, value)}
            errors={[]}
            context={{
              session: {
                id: 'manual-form-session',
                fields: [],
                responses: new Map(),
                completedFieldIds: new Set(),
                method: 'manual_form',
                startedAt: new Date(),
                lastActivity: new Date(),
                isComplete: false,
                validationErrors: new Map(),
              },
              previousResponses: Array.from(responses.values()),
              method: 'manual_form',
            }}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  )
}
