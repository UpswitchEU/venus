export function getLastFullFiscalYear(): number {
  return Math.min(Math.max(new Date().getFullYear() - 1, 2000), 2100)
}
