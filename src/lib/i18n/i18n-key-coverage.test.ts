import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * i18n raw-key regression guard.
 *
 * Every `useTranslations('ns')` / `getTranslations('ns')` binding paired with a
 * static `t('key')` call must resolve to a real string in BOTH locales — or
 * next-intl renders the raw dotted key path in the UI (e.g. the
 * `chatAssistant.offlineFallbackBadge` that shipped to a client on the Three
 * Towers report). This test scans the source the same way the runtime resolves
 * keys (base messages + the `startupStudio` overlay, mirroring
 * `loadLocaleMessages`) and fails on any new missing key.
 *
 * Dynamic keys — `t(`${x}`)`, `t(variable)` — are intentionally NOT checked
 * (can't be resolved statically); only quoted-literal calls are.
 */

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const SRC_DIR = join(APP_ROOT, 'src')

/**
 * Known gaps, deliberately excluded. Keep this list SHRINKING — every entry is
 * a real missing key that simply isn't worth translating yet.
 *
 * `home.*` — consumed only by `HomePage`, which is mounted exclusively on the
 * dev-only `app/[locale]/preview-home` route (never production). Landing-page
 * hero copy is intentionally deferred.
 */
const ALLOWLIST = new Set<string>([
  'home.hero.title',
  'home.hero.titleLine2',
  'home.hero.subtitle',
  'home.hero.cta',
  'home.hero.placeholder',
  'home.hero.trustSignal',
  'home.flows.manual',
  'home.flows.conversational',
])

function loadMerged(locale: 'nl' | 'en' | 'fr'): Record<string, unknown> {
  const base = JSON.parse(readFileSync(join(APP_ROOT, `messages/${locale}.json`), 'utf8'))
  const startupStudio = JSON.parse(
    readFileSync(join(APP_ROOT, `messages/startupStudio/${locale}.json`), 'utf8')
  )
  return { ...base, startupStudio }
}

function hasKey(messages: Record<string, unknown>, path: string): boolean {
  return (
    path.split('.').reduce<unknown>((node, segment) => {
      if (node && typeof node === 'object' && segment in (node as Record<string, unknown>)) {
        return (node as Record<string, unknown>)[segment]
      }
      return undefined
    }, messages) !== undefined
  )
}

function walkSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue
      walkSourceFiles(full, acc)
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

interface KeyRef {
  full: string
  file: string
  line: number
}

function collectReferencedKeys(files: string[]): KeyRef[] {
  const refs: KeyRef[] = []
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n')
    const varToNamespace: Record<string, string> = {}
    for (const line of lines) {
      const named = line.match(
        /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*['"]([^'"]+)['"]\s*\)/
      )
      if (named) varToNamespace[named[1]] = named[2]
      const root = line.match(
        /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*\)/
      )
      if (root) varToNamespace[root[1]] = ''
    }
    const vars = Object.keys(varToNamespace)
    if (vars.length === 0) continue
    // matches t('key'), t.rich('key'), t.markup('key') — the render paths
    const callRe = new RegExp(
      `\\b(${vars.join('|')})(?:\\.rich|\\.markup)?\\(\\s*(['"])([A-Za-z0-9_.]+)\\2`,
      'g'
    )
    lines.forEach((line, index) => {
      let match: RegExpExecArray | null
      while ((match = callRe.exec(line)) !== null) {
        const namespace = varToNamespace[match[1]]
        const key = match[3]
        refs.push({
          full: namespace ? `${namespace}.${key}` : key,
          file: file.slice(APP_ROOT.length + 1),
          line: index + 1,
        })
      }
    })
  }
  return refs
}

describe('i18n key coverage', () => {
  const nl = loadMerged('nl')
  const en = loadMerged('en')
  const fr = loadMerged('fr')
  const refs = collectReferencedKeys(walkSourceFiles(SRC_DIR))

  it('finds a meaningful number of static key references (scanner sanity)', () => {
    // Guards against the scanner silently matching nothing (e.g. a regex change)
    // and the suite passing vacuously.
    expect(refs.length).toBeGreaterThan(1500)
  })

  it('every statically-referenced key resolves in nl, en, and fr', () => {
    const missing = refs.filter(
      (ref) =>
        !ALLOWLIST.has(ref.full) &&
        (!hasKey(nl, ref.full) || !hasKey(en, ref.full) || !hasKey(fr, ref.full))
    )
    const report = [...new Map(missing.map((m) => [m.full, m])).values()]
      .map((m) => `  ✗ ${m.full}  (${m.file}:${m.line})`)
      .join('\n')
    expect(missing, `Missing i18n keys (raw-render risk):\n${report}`).toEqual([])
  })

  it('allowlisted keys are still genuinely missing (prune stale entries)', () => {
    // When someone finally adds an allowlisted key, this fails so the entry is
    // removed — the allowlist must never outlive the gap it documents.
    const stale = [...ALLOWLIST].filter((key) => hasKey(nl, key) && hasKey(en, key))
    expect(stale, `Allowlist entries that now exist — delete them:\n${stale.join('\n')}`).toEqual(
      []
    )
  })
})
