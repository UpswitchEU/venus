export const PRIVATE_BFF_JSON_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
  'Content-Type': 'application/json',
} as const
