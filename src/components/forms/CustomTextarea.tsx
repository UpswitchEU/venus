// 📝 Custom Textarea - Clarity Aurora Design System
// Wraps AuroraTextarea with Venus form field props

import React from 'react'
import { AuroraTextarea } from '@/design-system'

export interface CustomTextareaProps {
  label: string
  placeholder: string
  value: string
  onChange: (_e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onBlur: (_e: React.FocusEvent<HTMLTextAreaElement>) => void
  onFocus?: (_e: React.FocusEvent<HTMLTextAreaElement>) => void
  name: string
  className?: string
  error?: string
  touched?: boolean
  textareaRef?: React.RefObject<HTMLTextAreaElement>
  required?: boolean
  disabled?: boolean
  rows?: number
  minHeight?: number
  maxHeight?: number
  autoResize?: boolean
  minRows?: number
  maxRows?: number
  characterLimit?: number
  description?: string
}

const CustomTextarea: React.FC<CustomTextareaProps> = ({
  label,
  placeholder,
  value,
  onChange,
  onBlur,
  onFocus,
  name,
  className = '',
  error,
  touched,
  textareaRef,
  required = false,
  disabled = false,
  autoResize = true,
  characterLimit,
  description,
}) => {
  return (
    <div className={`mb-6 ${className}`}>
      <AuroraTextarea
        ref={textareaRef}
        label={label}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onFocus={onFocus}
        name={name}
        error={error}
        touched={touched}
        required={required}
        disabled={disabled}
        autoResize={autoResize}
      />
      {(description || characterLimit !== undefined) && (
        <div className="flex justify-between items-center mt-2">
          {description && <span className="text-sm text-foreground/50">{description}</span>}
          {characterLimit !== undefined && (
            <span
              className={`text-sm ${value.length > characterLimit ? 'text-destructive' : 'text-foreground/50'}`}
            >
              {value.length}/{characterLimit}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default CustomTextarea
