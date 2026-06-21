import {
  optionalString,
  optionalStringList,
  pendingRequest,
  recordValue,
} from './tool-result-parser-utils'
import type {
  CsvUploadRequest,
  MultiSelectRequest,
  SecureCredentialRequest,
  SingleSelectRequest,
} from './tool-result-types'

export function parseSecureCredentialRequest(data: unknown): SecureCredentialRequest[] {
  const d = recordValue(data)
  if (!d) return []
  const req = pendingRequest(d)
  if (!req) return []

  const fields = Array.isArray(req.fields)
    ? req.fields
        .filter(
          (field): field is Record<string, unknown> => typeof field === 'object' && field !== null
        )
        .map((field) => ({
          key: typeof field.key === 'string' ? field.key : '',
          label: typeof field.label === 'string' ? field.label : '',
          masked: field.masked !== false,
          required: field.required !== false,
          helper: optionalString(field.helper),
        }))
        .filter((field) => field.key.length > 0 && field.label.length > 0)
    : []

  return [
    {
      status: 'pending_approval',
      provider: optionalString(req.provider),
      reason: optionalString(req.reason),
      fields,
      submitPath: optionalString(req.submit_path),
      message: optionalString(d.message),
    },
  ]
}

export function parseCsvUploadRequest(data: unknown): CsvUploadRequest[] {
  const d = recordValue(data)
  if (!d) return []
  const req = pendingRequest(d)
  if (!req) return []

  const mode = req.mode
  return [
    {
      status: 'pending_approval',
      mode: mode === 'single_client_trial_balance' || mode === 'bulk_clients' ? mode : undefined,
      label: optionalString(req.label),
      reason: optionalString(req.reason),
      expectedColumns: optionalStringList(req.expected_columns) ?? [],
      submitPath: optionalString(req.submit_path),
      maxSizeBytes: typeof req.max_size_bytes === 'number' ? req.max_size_bytes : undefined,
      accept: optionalString(req.accept),
      message: optionalString(d.message),
    },
  ]
}

function parseSelectOptions(
  value: unknown
): Array<{ value: string; label: string; helper?: string }> {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (option): option is Record<string, unknown> => typeof option === 'object' && option !== null
    )
    .map((option) => ({
      value: typeof option.value === 'string' ? option.value : '',
      label: typeof option.label === 'string' ? option.label : '',
      helper: optionalString(option.helper),
    }))
    .filter((option) => option.value.length > 0 && option.label.length > 0)
}

export function parseMultiSelectRequest(data: unknown): MultiSelectRequest[] {
  const d = recordValue(data)
  if (!d) return []
  const req = pendingRequest(d)
  if (!req) return []
  const options = parseSelectOptions(req.options)
  if (options.length < 2) return []

  return [
    {
      status: 'pending_approval',
      title: optionalString(req.title),
      options,
      minSelections: typeof req.min_selections === 'number' ? req.min_selections : 0,
      maxSelections: typeof req.max_selections === 'number' ? req.max_selections : options.length,
      preselected: optionalStringList(req.preselected) ?? [],
      submitPath: optionalString(req.submit_path),
      reason: optionalString(req.reason),
    },
  ]
}

export function parseSingleSelectRequest(data: unknown): SingleSelectRequest[] {
  const d = recordValue(data)
  if (!d) return []
  const req = pendingRequest(d)
  if (!req) return []
  const options = parseSelectOptions(req.options)
  if (options.length < 2) return []

  return [
    {
      status: 'pending_approval',
      title: optionalString(req.title),
      options,
      preselected: typeof req.preselected === 'string' ? req.preselected : null,
      submitPath: optionalString(req.submit_path),
      reason: optionalString(req.reason),
    },
  ]
}
