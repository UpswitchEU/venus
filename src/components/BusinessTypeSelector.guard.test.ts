import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const PRODUCT_ROOTS = ['app', 'src']
const LEGACY_SINGLE_SELECT_COMPONENTS = ['BusinessTypeSearchInput', 'CustomBusinessTypeSearch']

const ALLOWED_LEGACY_PATHS = new Set([
  'src/components/forms/CustomBusinessTypeSearch.tsx',
  'src/components/forms/index.ts',
  'src/design-system/components/EntitySearch.tsx',
  'src/design-system/components/index.ts',
  'src/design-system/components/entity-search/BusinessTypeSearchInput.tsx',
])

async function collectSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name)
      if (entry.isDirectory()) return collectSourceFiles(path)
      if (!/\.(ts|tsx)$/.test(entry.name)) return []
      return [path]
    })
  )
  return files.flat()
}

describe('business type selector product guard', () => {
  it('does not render the legacy single-select business type input from product flows', async () => {
    const cwd = process.cwd()
    const sourceFiles = (
      await Promise.all(PRODUCT_ROOTS.map((root) => collectSourceFiles(join(cwd, root))))
    )
      .flat()
      .filter((path) => !path.endsWith('BusinessTypeSelector.guard.test.ts'))
      .filter((path) => !/\.(test|spec)\.(ts|tsx)$/.test(path))

    const offenders = (
      await Promise.all(
        sourceFiles.map(async (file) => {
          const rel = relative(cwd, file)
          if (ALLOWED_LEGACY_PATHS.has(rel)) return []
          const text = await readFile(file, 'utf8')
          return LEGACY_SINGLE_SELECT_COMPONENTS.filter((componentName) =>
            text.includes(componentName)
          ).map((componentName) => `${rel}:${componentName}`)
        })
      )
    )
      .flat()
      .sort()

    expect(offenders).toEqual([])
  }, 30000)
})
