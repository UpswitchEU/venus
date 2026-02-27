// Legacy form components (backward compatibility)

export type {
  AuroraButtonProps,
  AuroraInputProps,
  AuroraSelectProps,
  PasswordInputProps,
  SearchInputProps,
  SelectGroup,
  SelectOption,
  SelectOptions,
  TextareaProps as AuroraTextareaProps,
} from '../../design-system/components'
// Aurora Design System components (new design)
export {
  AuroraButton,
  AuroraInput,
  AuroraSelect,
  AuroraTextarea,
  PasswordInput,
  SearchInput,
} from '../../design-system/components'
export { default as CompanyNameInput } from './CompanyNameInput'
export { default as CompanyPreviewCard } from './CompanyPreviewCard'
export { CustomBusinessTypeSearch } from './CustomBusinessTypeSearch'
export { default as CustomDropdown } from './CustomDropdown'
export { default as CustomInputField } from './CustomInputField'
export { default as CustomNumberInputField } from './CustomNumberInputField'
export { default as CustomTextarea } from './CustomTextarea'
export { default as HistoricalDataInputs } from './HistoricalDataInputs'
