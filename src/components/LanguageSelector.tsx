/**
 * Language Selector Component
 *
 * Allows users to switch between English and Dutch
 * Displays flags and language names
 */

'use client'

import { Globe } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../hooks/useI18n'

interface LanguageSelectorProps {
  variant?: 'desktop' | 'mobile'
  className?: string
}

const languages = [
  {
    code: 'en' as const,
    name: 'English',
    flag: '🇬🇧',
  },
  {
    code: 'nl' as const,
    name: 'Nederlands',
    flag: '🇧🇪', // Belgian flag (Flemish/Dutch)
  },
]

export function LanguageSelector({ variant = 'desktop', className = '' }: LanguageSelectorProps) {
  const { locale, changeLanguage, t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentLanguage = languages.find((lang) => lang.code === locale)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isOpen])

  const handleLanguageChange = (langCode: 'en' | 'nl') => {
    changeLanguage(langCode)
    setIsOpen(false)
  }

  if (variant === 'mobile') {
    return (
      <div className={`flex flex-col space-y-2 ${className}`}>
        <div className="text-sm font-medium text-stone-400">{t('language.selectLanguage')}</div>
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={`flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors ${
              locale === lang.code ? 'bg-zinc-800 text-white' : 'hover:bg-zinc-800 text-stone-400'
            }`}
            aria-label={`Switch to ${lang.name}`}
            aria-current={locale === lang.code ? 'true' : 'false'}
          >
            <span className="text-2xl">{lang.flag}</span>
            <span className="font-medium">{lang.name}</span>
            {locale === lang.code && <span className="ml-auto text-white">✓</span>}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors"
        aria-label={t('language.switchLanguage')}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Globe className="w-4 h-4 text-stone-400" />
        <span className="hidden md:inline text-sm font-medium text-stone-300">
          {currentLanguage?.flag} {currentLanguage?.name}
        </span>
        <span className="md:hidden text-sm">{currentLanguage?.flag}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-zinc-900 rounded-lg shadow-lg border border-zinc-800 z-[10000] overflow-hidden" style={{ zIndex: 10000 }}>
          <div className="py-1">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className={`flex items-center w-full space-x-3 px-4 py-2 text-sm transition-colors ${
                  locale === lang.code
                    ? 'bg-zinc-800 text-white'
                    : 'hover:bg-zinc-800 text-stone-400'
                }`}
                role="menuitem"
                aria-label={`Switch to ${lang.name}`}
                aria-current={locale === lang.code ? 'true' : 'false'}
              >
                <span className="text-xl">{lang.flag}</span>
                <span className="flex-1 text-left font-medium">{lang.name}</span>
                {locale === lang.code && <span className="text-white">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
