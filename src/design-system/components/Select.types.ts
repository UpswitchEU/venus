import type { ReactNode } from 'react'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  description?: string
  icon?: ReactNode
}

export interface SelectGroup {
  label: string
  options: SelectOption[]
}

export type SelectOptions = SelectOption[] | SelectGroup[]
