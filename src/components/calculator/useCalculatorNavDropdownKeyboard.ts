import { type KeyboardEvent, type RefObject, useCallback, useLayoutEffect, useRef } from 'react'

/** Keyboard access for the calculator's menu and searchable dropdown surfaces. */
export function useCalculatorNavDropdownKeyboard({
  open,
  setOpen,
  dropdownRef,
  menuRef,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  dropdownRef: RefObject<HTMLDivElement>
  menuRef: RefObject<HTMLDivElement>
}) {
  const initialFocus = useRef<'first' | 'last' | null>(null)
  const trigger = () => dropdownRef.current?.querySelector<HTMLElement>('[aria-controls]')
  const items = useCallback(
    () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>(
          'button, a[href], [role="menuitem"], [role="option"]'
        ) ?? []
      ).filter(
        (item) =>
          !item.matches(':disabled, [aria-disabled="true"]') &&
          !item.closest('[hidden], [aria-hidden="true"]')
      ),
    [menuRef]
  )

  useLayoutEffect(() => {
    if (!open || !initialFocus.current) return
    const available = items()
    const target = initialFocus.current === 'last' ? available.at(-1) : available[0]
    target?.focus()
    initialFocus.current = null
  }, [open, items])

  const closeAndRestoreFocus = () => {
    setOpen(false)
    trigger()?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const fromTrigger = target === trigger()
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      closeAndRestoreFocus()
      return
    }
    if (event.key === 'Tab' && open) {
      // Dismiss after focus leaves, without moving focus back to the trigger.
      return
    }
    if (!fromTrigger && target.matches('input, textarea, select, [contenteditable="true"]')) {
      return
    }
    if (fromTrigger && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      initialFocus.current = event.key === 'ArrowUp' ? 'last' : 'first'
      if (!open) setOpen(true)
      else {
        const available = items()
        const next = event.key === 'ArrowUp' ? available.at(-1) : available[0]
        next?.focus()
        initialFocus.current = null
      }
      return
    }
    if (!open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const available = items()
    if (!available.length) return
    const current = available.indexOf(target)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? available.length - 1
          : (current + (event.key === 'ArrowUp' ? -1 : 1) + available.length) % available.length
    event.preventDefault()
    available[next]?.focus()
  }

  return { onKeyDown, closeAndRestoreFocus }
}
