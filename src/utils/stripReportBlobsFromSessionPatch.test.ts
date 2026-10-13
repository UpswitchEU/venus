import { describe, expect, it } from 'vitest'
import {
  stripReportBlobsFromSessionPatch,
  stripReportBlobsFromValuationResult,
  stripReportsFromValuationSessionPatchUpdates,
} from './stripReportBlobsFromSessionPatch'

describe('stripReportBlobsFromSessionPatch', () => {
  it('strips receipt and binary artifacts in known result envelopes, preserving economic evidence', () => {
    const result = {
      valuation_id: 'run-3',
      version: { id: 'version-3', version_data: { outputs: { equity_value_mid: 42 } } },
      pdf_bytes: [1, 2, 3],
      pdf_base64: 'binary',
      details: {
        equity_value_mid: 42,
        valuation_result: {
          outputs: { version: { version_data: {} }, pdf_bytes: [1], normalized_ebitda: 12 },
        },
        detailed_results: { step_results: { '11': { synthesis: 42 } } },
      },
      report_context: { version: 'render-v1', academic_validation_issues: ['Indicative'] },
    }
    const slim = stripReportBlobsFromValuationResult(result)
    expect(slim).toEqual({
      valuation_id: 'run-3',
      details: {
        equity_value_mid: 42,
        valuation_result: { outputs: { normalized_ebitda: 12 } },
        detailed_results: result.details.detailed_results,
      },
      report_context: result.report_context,
    })
    expect(result.version.id).toBe('version-3')
    expect(result.pdf_bytes).toEqual([1, 2, 3])
    expect(stripReportBlobsFromValuationResult(slim)).toEqual(slim)
  })

  it('removes top-level HTML/PDF keys without mutating original', () => {
    const original = {
      company_name: 'ACME',
      htmlReport: '<html>' + 'x'.repeat(4000),
      pdf_html_report: 'y'.repeat(3000),
      _pdfHtmlReport: 'z'.repeat(3000),
      reportHtml: '<html>legacy mirror</html>',
      revenue: 1_000_000,
    }
    const copy = { ...original }
    const out = stripReportBlobsFromSessionPatch(copy) as Record<string, unknown>

    expect(copy.htmlReport).toBeDefined()
    expect(out.htmlReport).toBeUndefined()
    expect(out.pdf_html_report).toBeUndefined()
    expect(out._pdfHtmlReport).toBeUndefined()
    expect(out.reportHtml).toBeUndefined()
    expect(out.company_name).toBe('ACME')
    expect(out.revenue).toBe(1_000_000)
  })

  it('strips html blobs from nested valuation_result / valuationResult', () => {
    const vr = {
      equity_value_mid: 1_100_000,
      html_report: '<div>big</div>'.repeat(100),
      details: {
        html_report: '<p>inner</p>'.repeat(50),
        foo: 1,
      },
    }
    const out = stripReportBlobsFromSessionPatch({
      valuation_result: vr,
    }) as Record<string, unknown>

    const slim = out.valuation_result as Record<string, unknown>
    expect(slim.equity_value_mid).toBe(1_100_000)
    expect(slim.html_report).toBeUndefined()
    const det = slim.details as Record<string, unknown>
    expect(det.html_report).toBeUndefined()
    expect(det.foo).toBe(1)
  })

  it('preserves academic_validation_issues when stripping report blobs', () => {
    const out = stripReportBlobsFromValuationResult({
      equity_value_mid: 568_000,
      html_report: '<div>huge</div>',
      academic_validation_issues: ['WACC outside SME band'],
      details: {
        html_report: '<p>inner</p>',
        academic_validation_issues: ['WACC outside SME band'],
      },
    }) as Record<string, unknown>

    expect(out.academic_validation_issues).toEqual(['WACC outside SME band'])
    const details = out.details as Record<string, unknown>
    expect(details.academic_validation_issues).toEqual(['WACC outside SME band'])
  })

  it('strips transport-heavy blobs from a valuation result while preserving metrics', () => {
    const out = stripReportBlobsFromValuationResult({
      equity_value_mid: 1_100_000,
      html_report: '<div>huge</div>',
      htmlReport: '<div>huge camel</div>',
      pdf_html_report: '<html>pdf</html>',
      _pdfHtmlReport: '<html>pdf mirror</html>',
      pdfHtml: '<html>pdf camel</html>',
      reportHtml: '<html>legacy mirror</html>',
      details: {
        html_report: '<p>inner</p>',
        pdf_html_report: '<html>inner pdf</html>',
        method: 'dcf',
      },
    }) as Record<string, unknown>

    expect(out.equity_value_mid).toBe(1_100_000)
    expect(out.html_report).toBeUndefined()
    expect(out.htmlReport).toBeUndefined()
    expect(out.pdf_html_report).toBeUndefined()
    expect(out._pdfHtmlReport).toBeUndefined()
    expect(out.pdfHtml).toBeUndefined()
    expect(out.reportHtml).toBeUndefined()
    const details = out.details as Record<string, unknown>
    expect(details.html_report).toBeUndefined()
    expect(details.pdf_html_report).toBeUndefined()
    expect(details.method).toBe('dcf')
  })

  it('recursively strips blobs inside nested sessionData (mis-merged PATCH → create payloads)', () => {
    const heavy = '<html>' + 'a'.repeat(2000)
    const out = stripReportBlobsFromSessionPatch({
      company_name: 'Co',
      sessionData: {
        valuation_result: { equity_value_mid: 2, html_report: heavy },
        html_report: heavy,
      },
    }) as Record<string, unknown>

    expect(out.company_name).toBe('Co')
    const inner = out.sessionData as Record<string, unknown>
    expect(inner.html_report).toBeUndefined()
    const vr = inner.valuation_result as Record<string, unknown>
    expect(vr.equity_value_mid).toBe(2)
    expect(vr.html_report).toBeUndefined()
  })

  it('stripReportsFromValuationSessionPatchUpdates slims session_data snake_case payloads', () => {
    const out = stripReportsFromValuationSessionPatchUpdates({
      session_data: { html_report: 'big', company_name: 'X' },
    }) as Record<string, unknown>

    const sd = out.session_data as Record<string, unknown>
    expect(sd.company_name).toBe('X')
    expect(sd.html_report).toBeUndefined()
  })

  it('stripReportsFromValuationSessionPatchUpdates recurses partial_data', () => {
    const out = stripReportsFromValuationSessionPatchUpdates({
      partial_data: {
        html_report: 'h',
        valuation_result: { equity_value_mid: 3, html_report: 'z' },
      },
    }) as Record<string, unknown>
    const pd = out.partial_data as Record<string, unknown>
    expect(pd.html_report).toBeUndefined()
    const vr = pd.valuation_result as Record<string, unknown>
    expect(vr.equity_value_mid).toBe(3)
    expect(vr.html_report).toBeUndefined()
  })

  it('stripReportsFromValuationSessionPatchUpdates slims sessionData, partialData, and top-level blobs', () => {
    const out = stripReportsFromValuationSessionPatchUpdates({
      name: 'R1',
      htmlReport: 'huge',
      sessionData: { company_name: 'X', html_report: 'big' },
      partialData: { valuation_result: { equity_value_mid: 1, html_report: 'p' } },
    }) as Record<string, unknown>

    expect(out.name).toBe('R1')
    expect(out.htmlReport).toBeUndefined()
    const sd = out.sessionData as Record<string, unknown>
    expect(sd.company_name).toBe('X')
    expect(sd.html_report).toBeUndefined()
    const pd = out.partialData as Record<string, unknown>
    const vr = pd.valuation_result as Record<string, unknown>
    expect(vr.equity_value_mid).toBe(1)
    expect(vr.html_report).toBeUndefined()
  })
})
