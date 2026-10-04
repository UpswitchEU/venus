import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import resolveConfig from 'tailwindcss/resolveConfig'
import tailwindConfig from '../../tailwind.config'

type RGB = [number, number, number]
const css = readFileSync('src/styles/design-tokens/colors.css', 'utf8')
const colors = resolveConfig(tailwindConfig).theme.colors as Record<string, any>
function hsl(value: string): RGB {
  const [h, s, l] = value.match(/[\d.]+/g)!.map(Number)
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  return [0, 8, 4].map((n) => {
    const k = (n + h / 30) % 12
    return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }) as RGB
}
function parse(value: string, scope: string): RGB {
  const token = value.match(/var\((--[\w-]+)\)/)?.[1]
  if (token) return hsl(scope.match(new RegExp(`${token}: ([^;]+);`))![1])
  return value
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16) / 255) as RGB
}
function luminance(rgb: RGB) {
  return rgb.reduce(
    (sum, value, i) =>
      sum +
      [0.2126, 0.7152, 0.0722][i] *
        (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4),
    0
  )
}
function contrast(a: RGB, b: RGB) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

describe('primary action text contrast', () => {
  it.each([':root', '.light'])('meets AA at rest and on hover in %s', (selector) => {
    const scope = css.split(`${selector} {`)[1].split('}')[0]
    const foreground = parse(colors.primary.foreground, scope)
    const canvas = parse(colors.background, scope)
    // Exercise both the app's resolved utility and direct semantic-token consumers.
    for (const primary of [colors.primary.DEFAULT, 'hsl(var(--primary))']) {
      const background = parse(primary, scope)
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5)
      const hover = background.map((value, i) => value * 0.9 + canvas[i] * 0.1) as RGB
      expect(contrast(foreground, hover)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
