// Legacy form components (backward compatibility)
export { default as CompanyNameInput } from './CompanyNameInput'
export { default as CompanyPreviewCard } from './CompanyPreviewCard'
export { CustomBusinessTypeSearch } from './CustomBusinessTypeSearch'
export { default as CustomDropdown } from './CustomDropdown'
export { default as CustomInputField } from './CustomInputField'
export { default as CustomNumberInputField } from './CustomNumberInputField'
export { default as CustomTextarea } from './CustomTextarea'
export { default as HistoricalDataInputs } from './HistoricalDataInputs'

// Aurora Design System components (new design)
export { 
  AuroraInput, 
  PasswordInput, 
  SearchInput, 
  AuroraTextarea, 
  AuroraSelect,
  AuroraButton,
} from '../../design-system/components'
export type { 
  AuroraInputProps, 
  PasswordInputProps, 
  SearchInputProps, 
  TextareaProps as AuroraTextareaProps,
  AuroraSelectProps,
  AuroraButtonProps,
  SelectOption,
  SelectGroup,
  SelectOptions,
} from '../../design-system/components'
