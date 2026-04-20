/**
 * Manual Form Field Renderer
 *
 * Single Responsibility: Render data fields using traditional form input patterns
 * SOLID Principles: SRP, OCP, LSP, ISP, DIP
 *
 * Uses DataCollectorBase for shared validation and normalization logic
 */

import React from 'react'
import { formCollector } from '../../../features/shared/dataCollection'
import { DataField, FieldRendererProps, ParsedFieldValue } from '../../../types/data-collection'

export const ManualFormFieldRenderer: React.FC<FieldRendererProps> = ({
  field,
  value,
  onChange,
  errors = [],
  disabled = false,
  autoFocus = false,
}) => {
  const hasErrors = errors.length > 0
  const errorMessage = errors.find((e) => e.severity === 'error')?.message

  const handleChange = (rawValue: ParsedFieldValue) => {
    // Use shared normalization logic from DataCollectorBase
    const normalizedValue = formCollector.normalizeValue(field, rawValue)
    onChange(normalizedValue, formCollector.getCollectionMethod())
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-foreground">
        {field.label}
        {field.required && <span className="text-destructive ml-1">*</span>}
      </label>

      {field.description && <p className="text-sm text-muted-foreground">{field.description}</p>}

      <FieldInput
        field={field}
        value={value ?? ''}
        onChange={handleChange}
        disabled={disabled}
        autoFocus={autoFocus}
        hasErrors={hasErrors}
      />

      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
    </div>
  )
}

interface FieldInputProps {
  field: DataField
  value: string | number | boolean
  onChange: (value: ParsedFieldValue) => void
  disabled?: boolean
  autoFocus?: boolean
  hasErrors?: boolean
}

const FieldInput: React.FC<FieldInputProps> = ({
  field,
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  hasErrors = false,
}) => {
  const baseClasses = `
    w-full px-3 py-2 bg-muted border rounded-lg text-foreground placeholder-muted-foreground
    focus:outline-none focus:ring-2 focus:ring-primary
    [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none
    ${hasErrors ? 'border-destructive' : 'border-foreground/20'}
    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
  `

  switch (field.type) {
    case 'text':
    case 'textarea': {
      const textValue = typeof value === 'string' ? value : String(value || '')
      if (field.type === 'textarea') {
        return (
          <textarea
            value={textValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
            rows={4}
            className={baseClasses}
          />
        )
      }
      return (
        <input
          type="text"
          value={textValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className={baseClasses}
        />
      )
    }

    case 'number':
    case 'currency': {
      const numericValue = typeof value === 'number' ? value : value ? Number(value) : ''
      return (
        <input
          type="number"
          value={numericValue}
          onChange={(e) => onChange(e.target.value)} // Raw value, normalized by handleChange
          placeholder={field.placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          min={field.validation?.find((v) => v.type === 'min')?.value as number}
          max={field.validation?.find((v) => v.type === 'max')?.value as number}
          className={baseClasses}
        />
      )
    }

    case 'select': {
      const selectValue = typeof value === 'string' ? value : String(value || '')
      return (
        <select
          value={selectValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoFocus={autoFocus}
          className={baseClasses}
        >
          <option value="">{field.placeholder || `Select ${field.label}`}</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    }

    case 'boolean': {
      const booleanValue = Boolean(value)
      return (
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={booleanValue}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            autoFocus={autoFocus}
            className="w-4 h-4 text-primary bg-muted border-foreground/20 rounded focus:ring-primary"
          />
          <span className="text-sm text-muted-foreground">Yes</span>
        </div>
      )
    }

    case 'percentage': {
      const percentageValue = typeof value === 'number' ? value * 100 : value ? Number(value) : ''
      return (
        <div className="relative">
          <input
            type="number"
            value={percentageValue}
            onChange={(e) => onChange(e.target.value)} // Raw value, normalized by handleChange
            placeholder={field.placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
            min="0"
            max="100"
            step="0.01"
            className={baseClasses}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
        </div>
      )
    }

    default: {
      const defaultValue = typeof value === 'string' ? value : String(value || '')
      return (
        <input
          type="text"
          value={defaultValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className={baseClasses}
        />
      )
    }
  }
}
