const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

let fallbackCounter = 0

function fallbackToken(length: number): string {
  const seed = `${Date.now().toString(36)}${(globalThis.performance?.now() ?? 0)
    .toString(36)
    .replace('.', '')}${(fallbackCounter++).toString(36)}`

  return seed.repeat(Math.ceil(length / seed.length)).slice(0, length)
}

export function createRandomToken(length = 12): string {
  if (length <= 0) return ''

  const cryptoApi = globalThis.crypto
  const uuid = cryptoApi?.randomUUID?.().replaceAll('-', '')
  if (uuid && uuid.length >= length) {
    return uuid.slice(0, length)
  }

  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(length)
    cryptoApi.getRandomValues(bytes)
    return Array.from(bytes, (byte) => ALPHABET.charAt(byte % ALPHABET.length)).join('')
  }

  return fallbackToken(length)
}

export function createRandomId(prefix: string, tokenLength = 12): string {
  return `${prefix}_${Date.now().toString(36)}_${createRandomToken(tokenLength)}`
}
