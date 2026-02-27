/**
 * File Upload Field Renderer
 *
 * Single Responsibility: Render data fields with file upload and parsing capabilities
 * SOLID Principles: SRP, OCP, LSP, ISP, DIP
 */

import { AlertCircle, CheckCircle, FileText, Upload } from 'lucide-react'
import React, { useRef, useState } from 'react'
import { FieldRendererProps, ParsedFieldValue } from '../../../types/data-collection'

export const FileUploadFieldRenderer: React.FC<FieldRendererProps> = ({
  field,
  value,
  onChange,
  errors = [],
  disabled = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingError, setProcessingError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const _hasErrors = errors.length > 0
  const errorMessage = errors.find((e) => e.severity === 'error')?.message

  const supportedFormats = getSupportedFormats(field)
  const maxSize = 10 * 1024 * 1024 // 10MB

  const validateFile = (file: File): { valid: boolean; errors: string[] } => {
    const errors: string[] = []

    // Check file size
    if (file.size > maxSize) {
      errors.push('File size must be less than 10MB')
    }

    // Check file type
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!supportedFormats.includes(fileExtension)) {
      errors.push(`File type not supported. Supported formats: ${supportedFormats.join(', ')}`)
    }

    return { valid: errors.length === 0, errors }
  }

  const processFile = async (file: File) => {
    setIsProcessing(true)
    setProcessingError(null)

    try {
      // Simulate file processing (in real implementation, this would call an API)
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Mock successful processing - in reality, this would extract data from the file
      const mockExtractedValue =
        field.id === 'revenue'
          ? 500000
          : field.id === 'ebitda'
            ? 150000
            : field.id === 'number_of_employees'
              ? 25
              : `Extracted from ${file.name}`

      onChange(mockExtractedValue, 'file_upload')
      setProcessingError(null)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'File processing failed'
      setProcessingError(errorMessage)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleFileSelect = async (file: File) => {
    const validation = validateFile(file)
    if (!validation.valid) {
      setProcessingError(validation.errors.join(', '))
      return
    }

    setUploadedFile(file)
    setProcessingError(null)
    await processFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const removeFile = () => {
    setUploadedFile(null)
    setProcessingError(null)
    onChange(undefined, 'file_upload')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <Upload className="w-4 h-4 text-primary" />
        <label className="text-sm font-medium text-foreground">
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </label>
      </div>

      {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}

      {/* File Upload Area */}
      {!uploadedFile && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            relative border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer
            ${
              isDragOver
                ? 'border-primary bg-primary/10'
                : 'border-foreground/20 hover:border-foreground/30'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileInputChange}
            accept={supportedFormats.join(',')}
            disabled={disabled}
            className="hidden"
          />

          <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-1">
            Drop your file here or click to browse
          </p>
          <p className="text-xs text-muted-foreground">
            Supported formats: {supportedFormats.join(', ')} (max{' '}
            {Math.round(maxSize / 1024 / 1024)}MB)
          </p>
        </div>
      )}

      {/* Processing State */}
      {uploadedFile && isProcessing && (
        <div className="flex items-center space-x-3 p-4 bg-muted rounded-lg border border-foreground/20">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
          <div>
            <p className="text-sm text-foreground">Processing {uploadedFile.name}...</p>
            <p className="text-xs text-muted-foreground">
              Extracting {field.label.toLowerCase()} from document
            </p>
          </div>
        </div>
      )}

      {/* Success State */}
      {uploadedFile && !isProcessing && !processingError && value !== undefined && (
        <div className="flex items-center justify-between p-4 bg-success/10 rounded-lg border border-success/30">
          <div className="flex items-center space-x-3">
            <CheckCircle className="w-5 h-5 text-success" />
            <div>
              <p className="text-sm text-foreground">Successfully processed {uploadedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                Extracted: <span className="text-success">{formatValue(value, field)}</span>
              </p>
            </div>
          </div>
          <button
            onClick={removeFile}
            className="text-muted-foreground hover:text-foreground text-sm"
            disabled={disabled}
          >
            Remove
          </button>
        </div>
      )}

      {/* Error State */}
      {processingError && (
        <div className="flex items-center space-x-3 p-4 bg-destructive/10 rounded-lg border border-destructive/20">
          <AlertCircle className="w-5 h-5 text-destructive" />
          <div className="flex-1">
            <p className="text-sm text-destructive">Processing failed</p>
            <p className="text-xs text-muted-foreground">{processingError}</p>
          </div>
          <button
            onClick={removeFile}
            className="text-muted-foreground hover:text-foreground text-sm"
            disabled={disabled}
          >
            Try again
          </button>
        </div>
      )}

      {/* Extraction Hints */}
      {field.id && (
        <div className="bg-muted rounded-lg p-3 border border-foreground/20">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            💡 What to look for in your file:
          </p>
          <ul className="text-xs text-muted-foreground space-y-1">
            {getExtractionHints(field).map((hint, index) => (
              <li key={index}>• {hint}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Field-level error */}
      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
    </div>
  )
}

function getSupportedFormats(field: import('../../../types/data-collection').DataField): string[] {
  switch (field.type) {
    case 'currency':
    case 'number':
      return ['.xlsx', '.xls', '.csv', '.pdf']
    case 'text':
    case 'textarea':
      return ['.pdf', '.docx', '.doc', '.txt']
    default:
      return ['.pdf', '.xlsx', '.xls', '.csv']
  }
}

function getExtractionHints(field: import('../../../types/data-collection').DataField): string[] {
  switch (field.id) {
    case 'revenue':
      return [
        'Look for "Revenue", "Sales", "Turnover" in financial statements',
        'Check income statements or P&L sections',
        'Annual figures are preferred over monthly',
      ]
    case 'ebitda':
      return [
        'Look for "EBITDA", "Operating Profit", "Earnings Before Interest..."',
        'Check income statements',
        'Exclude extraordinary items if possible',
      ]
    case 'number_of_employees':
      return [
        'Look for "Number of Employees", "Headcount", "Staff Count"',
        'Check company overview or HR sections',
        'Full-time equivalents (FTE) preferred',
      ]
    default:
      return [
        `Look for "${field.label}" in the document`,
        'Check tables, headers, and key sections',
        'Use the most recent or relevant figures',
      ]
  }
}

function formatValue(
  value: ParsedFieldValue,
  field: import('../../../types/data-collection').DataField
): string {
  if (typeof value === 'number') {
    if (field.type === 'currency') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'EUR',
      }).format(value)
    }
    return value.toLocaleString()
  }
  return String(value)
}
