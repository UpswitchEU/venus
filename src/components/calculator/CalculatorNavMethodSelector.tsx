import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import type { useTranslations } from 'next-intl'
import { MethodSelectorMenu } from '@/components/calculator/method-selector-menu'
import { cn } from '@/design-system/utils'
import { Dropdown } from './CalculatorNavDropdown'

interface CalculatorNavMethodSelectorProps {
  compactMethodLabel: string
  displayPreSelectedMethod: string
  methodTriggerLabel: string
  onPlanLockedMethodAction?: () => void
  onPreSelectMethod?: (method: string) => void
  onToggleMethod?: (method: string) => void
  planLockedMethodKeys?: ReadonlySet<string>
  preSelectableMethods: readonly string[]
  preSelectedMethods?: string[]
  t: ReturnType<typeof useTranslations>
  variant: 'desktop' | 'mobile'
}

export function CalculatorNavMethodSelector({
  compactMethodLabel,
  displayPreSelectedMethod,
  methodTriggerLabel,
  onPlanLockedMethodAction,
  onPreSelectMethod,
  onToggleMethod,
  planLockedMethodKeys,
  preSelectableMethods,
  preSelectedMethods,
  t,
  variant,
}: CalculatorNavMethodSelectorProps) {
  if (!onPreSelectMethod) return null

  const menu = (
    <MethodSelectorMenu
      preSelectedMethod={displayPreSelectedMethod}
      preSelectedMethods={preSelectedMethods}
      onPreSelectMethod={onPreSelectMethod}
      onToggleMethod={onToggleMethod}
      methods={preSelectableMethods}
      t={t}
      lockedMethodKeys={planLockedMethodKeys}
      onLockedMethodClick={onPlanLockedMethodAction}
    />
  )

  if (variant === 'desktop') {
    return (
      <div className="hidden md:flex min-w-0 items-center">
        <div className="h-5 w-px bg-foreground/[0.08] ml-1.5 mr-4 shrink-0" aria-hidden />
        <Dropdown
          keepOpen
          trigger={
            <button
              type="button"
              aria-haspopup="listbox"
              title={methodTriggerLabel}
              aria-label={methodTriggerLabel}
              className="group flex min-w-0 max-w-[140px] lg:max-w-[160px] items-center gap-2 rounded-full min-h-[40px] border border-foreground/[0.06] bg-foreground/[0.03] px-2.5 py-1.5 text-sm font-medium text-foreground/80 hover:bg-foreground/[0.06] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-foreground/55 group-hover:text-foreground/70 shrink-0" />
              <span className="truncate min-w-0 flex-1 text-left">{compactMethodLabel}</span>
              <ChevronDown className="w-3 h-3 text-foreground/40 group-hover:text-foreground/60 shrink-0" />
            </button>
          }
        >
          {menu}
        </Dropdown>
      </div>
    )
  }

  return (
    <div className="min-w-0">
      <Dropdown
        keepOpen
        avoidViewportOverflow="mobile"
        trigger={
          <button
            type="button"
            aria-haspopup="listbox"
            title={methodTriggerLabel}
            aria-label={methodTriggerLabel}
            className={cn(
              'flex h-11 w-full min-w-0 items-center gap-1.5 rounded-lg border',
              'border-foreground/[0.06] bg-foreground/[0.03] px-2 text-xs font-medium',
              'text-foreground transition-colors hover:bg-foreground/[0.05]',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-foreground/55" />
            <span className="min-w-0 flex-1 truncate text-left text-foreground/70">
              {compactMethodLabel}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-foreground/40" />
          </button>
        }
      >
        {menu}
      </Dropdown>
    </div>
  )
}
