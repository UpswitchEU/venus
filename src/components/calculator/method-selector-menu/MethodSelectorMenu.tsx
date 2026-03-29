'use client'

/**
 * Valuation method listbox for CalculatorNav (desktop + mobile dropdowns).
 *
 * Styling tokens: `./tokens.ts`. i18n: `@/constants/methodLabels.ts` and
 * `messages` locale files under `manualInput.methodSelector`.
 */

import { Check, HelpCircle } from 'lucide-react'
import React from 'react'
import {
  COMBINABLE_METHODS,
  getConflictingMethod,
  STANDALONE_METHODS,
} from '@/constants/methodFieldConfig'
import { METHOD_DESCRIPTION_KEYS, METHOD_LABEL_KEYS } from '@/constants/methodLabels'
import { Tooltip } from '@/design-system'
import { cn } from '@/design-system/utils'
import {
  methodSelectorDividerClass,
  methodSelectorListboxClass,
  methodSelectorRowInfoButtonClass,
  methodSelectorSectionHeadingRowClass,
  methodSelectorSectionHeadingTextClass,
  methodSelectorSectionInfoButtonClass,
  methodSelectorStaticSectionTitleClass,
  methodSelectorTooltipBodyClass,
  methodSelectorTooltipSurfaceClass,
} from './tokens'

const stopInDropdown: React.HTMLAttributes<HTMLButtonElement> = {
  onPointerDown: (e) => e.stopPropagation(),
  onClick: (e) => e.stopPropagation(),
}

function MethodSelectorTooltip({
  content,
  children,
}: {
  content: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Tooltip
      content={content}
      className={methodSelectorTooltipSurfaceClass}
      side="top"
      align="end"
    >
      {children}
    </Tooltip>
  )
}

export interface MethodSelectorMenuProps {
  preSelectedMethod?: string
  preSelectedMethods?: string[]
  onPreSelectMethod: (method: string) => void
  onToggleMethod?: (method: string) => void
  /** Subset of PRE_SELECTABLE_METHODS (e.g. NL firms omit fiscal_4x) */
  methods: readonly string[]
  t: (key: string, values?: Record<string, string>) => string
}

export function MethodSelectorMenu({
  preSelectedMethod,
  preSelectedMethods,
  onPreSelectMethod,
  onToggleMethod,
  methods,
  t,
}: MethodSelectorMenuProps) {
  const isMultiMode = !!onToggleMethod
  const activeMethods = preSelectedMethods ?? [preSelectedMethod ?? 'upswitch_adaptive']
  const descIdBase = React.useId()

  const combinableMethods = methods.filter((m) => COMBINABLE_METHODS.has(m))
  const standaloneMethods = methods.filter((m) => STANDALONE_METHODS.has(m) && m !== 'upswitch_adaptive')

  const handleClick = (key: string) => {
    if (isMultiMode) {
      onToggleMethod(key)
    } else {
      onPreSelectMethod(key)
    }
  }

  const isSelected = (key: string) => activeMethods.includes(key)

  const renderMethodButton = (key: string) => {
    const active = isSelected(key)
    const descKey = METHOD_DESCRIPTION_KEYS[key]
    const conflict = getConflictingMethod(key)
    const conflictActive = conflict ? activeMethods.includes(conflict) : false
    const conflictLabel = conflict ? t(METHOD_LABEL_KEYS[conflict] ?? '') : ''
    const shape = COMBINABLE_METHODS.has(key) ? 'rounded-md' : 'rounded-full'
    const labelText = t(METHOD_LABEL_KEYS[key] ?? 'manualInput.methodSelector.adaptiveRecommended')
    const descDomId = descKey ? `${descIdBase}-desc-${key}` : undefined

    const checkbox = active ? (
      <div className={cn('flex h-5 w-5 shrink-0 items-center justify-center bg-primary/20', shape)}>
        <Check className="h-3 w-3 text-primary" />
      </div>
    ) : (
      <div
        className={cn(
          'h-5 w-5 shrink-0 border border-foreground/[0.12] bg-foreground/[0.03]',
          shape
        )}
      />
    )

    const labelColumn = (
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span>{labelText}</span>
        {!active && conflictActive && isMultiMode && (
          <span className="text-[10px] font-normal leading-snug text-amber-500/70">
            {t('manualInput.methodSelector.willReplace', { method: conflictLabel })}
          </span>
        )}
      </div>
    )

    const rowButtonClass = cn(
      'flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-left text-sm transition-colors',
      active ? 'font-medium text-foreground' : 'text-foreground/80 hover:bg-foreground/[0.04]'
    )

    if (!descKey) {
      return (
        <button
          key={key}
          type="button"
          onClick={() => handleClick(key)}
          role="option"
          aria-selected={active}
          className={cn(
            'flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors',
            active
              ? 'bg-primary/[0.08] font-medium text-foreground'
              : 'text-foreground/80 hover:bg-foreground/[0.04]'
          )}
        >
          {checkbox}
          {labelColumn}
        </button>
      )
    }

    return (
      <div
        key={key}
        className={cn(
          'flex min-h-[44px] w-full items-stretch overflow-hidden rounded-lg',
          active ? 'bg-primary/[0.08]' : ''
        )}
      >
        <button
          type="button"
          onClick={() => handleClick(key)}
          role="option"
          aria-selected={active}
          aria-describedby={descDomId}
          className={rowButtonClass}
        >
          {checkbox}
          {labelColumn}
        </button>
        <MethodSelectorTooltip
          content={
            <span className={cn('block', methodSelectorTooltipBodyClass)}>{t(descKey)}</span>
          }
        >
          <button
            type="button"
            tabIndex={0}
            className={methodSelectorRowInfoButtonClass}
            aria-label={t('manualInput.methodSelector.moreInfoForMethod', { method: labelText })}
            {...stopInDropdown}
          >
            <HelpCircle className="h-4 w-4 shrink-0" aria-hidden />
          </button>
        </MethodSelectorTooltip>
        <span id={descDomId} className="sr-only">
          {t(descKey)}
        </span>
      </div>
    )
  }

  return (
    <div
      className={methodSelectorListboxClass}
      role="listbox"
      aria-label={t('manualInput.methodSelector.label')}
      aria-multiselectable={isMultiMode}
    >
      <div className={methodSelectorStaticSectionTitleClass}>
        {t('manualInput.methodSelector.recommended')}
      </div>
      {renderMethodButton('upswitch_adaptive')}

      <div className={methodSelectorDividerClass} />

      <div className={methodSelectorSectionHeadingRowClass}>
        <div className={methodSelectorSectionHeadingTextClass}>
          {t('manualInput.methodSelector.customBlend')}
        </div>
        <MethodSelectorTooltip
          content={
            <div className={cn('space-y-1.5', methodSelectorTooltipBodyClass)}>
              <p>{t('manualInput.methodSelector.combinableHint')}</p>
              {isMultiMode ? <p>{t('manualInput.methodSelector.exclusivityHint')}</p> : null}
            </div>
          }
        >
          <button
            type="button"
            tabIndex={0}
            className={methodSelectorSectionInfoButtonClass}
            aria-label={t('manualInput.methodSelector.sectionCombinableInfoAria')}
            {...stopInDropdown}
          >
            <HelpCircle className="h-4 w-4 shrink-0" aria-hidden />
          </button>
        </MethodSelectorTooltip>
      </div>
      {combinableMethods.map((key) => renderMethodButton(key))}

      {isMultiMode &&
        activeMethods.length > 1 &&
        activeMethods.every((m) => COMBINABLE_METHODS.has(m)) && (
          <div className="mt-1 px-2 py-1 text-[11px] font-medium text-primary/80">
            {activeMethods.length} {t('manualInput.methodSelector.methodsSelected')}
          </div>
        )}

      {standaloneMethods.length > 0 && (
        <>
          <div className={methodSelectorDividerClass} />

          <div className={methodSelectorSectionHeadingRowClass}>
            <div className={methodSelectorSectionHeadingTextClass}>
              {t('manualInput.methodSelector.statutoryLabel')}
            </div>
            <MethodSelectorTooltip
              content={
                <p className={methodSelectorTooltipBodyClass}>
                  {t('manualInput.methodSelector.standaloneHint')}
                </p>
              }
            >
              <button
                type="button"
                tabIndex={0}
                className={methodSelectorSectionInfoButtonClass}
                aria-label={t('manualInput.methodSelector.sectionStandaloneInfoAria')}
                {...stopInDropdown}
              >
                <HelpCircle className="h-4 w-4 shrink-0" aria-hidden />
              </button>
            </MethodSelectorTooltip>
          </div>
          {standaloneMethods.map((key) => renderMethodButton(key))}
        </>
      )}
    </div>
  )
}
