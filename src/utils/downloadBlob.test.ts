import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadBlob } from './downloadBlob'

describe('downloadBlob', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report-pdf')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps the connected link and blob available for asynchronous browser handoff', () => {
    let clicked: HTMLAnchorElement | undefined
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicked = this
      expect(this.isConnected).toBe(true)
      expect(this.download).toBe('report.pdf')
    })
    const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' })

    downloadBlob(blob, 'report.pdf')
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(clicked?.href).toBe('blob:report-pdf')
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(29_999)
    expect(clicked?.isConnected).toBe(true)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(clicked?.isConnected).toBe(false)
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:report-pdf')
  })

  it('releases resources and propagates a synchronous download failure', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('Browser rejected download')
    })
    expect(() => downloadBlob(new Blob(['%PDF']), 'report.pdf')).toThrow('Browser rejected')
    expect(document.querySelector('a[download="report.pdf"]')).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:report-pdf')
    expect(vi.getTimerCount()).toBe(0)
  })
})
