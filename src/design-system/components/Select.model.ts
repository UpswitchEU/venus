import type { SelectGroup, SelectOption, SelectOptions } from './Select.types'

export function isGroupedOptions(options: SelectOptions): options is SelectGroup[] {
  return options.length > 0 && 'options' in options[0]
}

export function flattenSelectOptions(options: SelectOptions): SelectOption[] {
  if (isGroupedOptions(options)) {
    return options.flatMap((group) => group.options)
  }

  return options
}

export function flattenEnabledSelectOptions(options: SelectOptions): SelectOption[] {
  return flattenSelectOptions(options).filter((option) => !option.disabled)
}

export function filterSelectOptions(options: SelectOptions, searchQuery: string): SelectOptions {
  if (!searchQuery) return options

  const query = searchQuery.toLowerCase()

  if (isGroupedOptions(options)) {
    return options
      .map((group) => ({
        ...group,
        options: group.options.filter((option) => optionMatchesQuery(option, query)),
      }))
      .filter((group) => group.options.length > 0)
  }

  return options.filter((option) => optionMatchesQuery(option, query))
}

export function createSelectFocusIndexMap(options: SelectOptions): Map<SelectOption, number> {
  const focusIndexByOption = new Map<SelectOption, number>()
  let nextFocusIndex = 0

  for (const option of flattenSelectOptions(options)) {
    if (!option.disabled) {
      focusIndexByOption.set(option, nextFocusIndex)
      nextFocusIndex += 1
    }
  }

  return focusIndexByOption
}

function optionMatchesQuery(option: SelectOption, query: string) {
  return (
    option.label.toLowerCase().includes(query) || option.description?.toLowerCase().includes(query)
  )
}
