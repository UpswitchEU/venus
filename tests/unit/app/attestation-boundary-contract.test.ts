import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Venus attestation product boundary', () => {
  it('wraps Venus attestation POST responses in a stable BFF envelope', () => {
    const source = readFileSync(join(process.cwd(), 'app/api/attestations/route.ts'), 'utf8')
    expect(source).toMatch(/success: true, data: json/)
    expect(source).toMatch(/success: false, message:/)
  })

  it('exposes attestation BFF routes for advisor overflow actions', () => {
    expect(existsSync(join(process.cwd(), 'app/api/attestations/route.ts'))).toBe(true)
    expect(existsSync(join(process.cwd(), 'app/api/attestations/readiness/route.ts'))).toBe(
      true
    )
    expect(
      existsSync(join(process.cwd(), 'app/api/valuations/[id]/review/route.ts'))
    ).toBe(true)
    expect(
      existsSync(join(process.cwd(), 'app/api/valuations/[id]/review/approve/route.ts'))
    ).toBe(true)
  })

  it('wires sign and approve overflow actions through ManualLayoutNav', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/features/manual/components/ManualLayoutNav.tsx'),
      'utf8'
    )

    expect(source).toMatch(/showSignAttest=\{showSignAttest\}/)
    expect(source).toMatch(/showApproveValuation=\{showApproveValuation\}/)
    expect(source).toMatch(/signAttestLabel=\{signAttestLabel\}/)
    expect(source).toMatch(/onPreview=\{handlePreview\}/)
    expect(source).toMatch(/onApproveValuation=\{onApproveValuation\}/)
  })

  it('consumes urlAction preview and download deep links', () => {
    const hookSource = readFileSync(
      join(process.cwd(), 'src/features/manual/components/useManualUrlActions.ts'),
      'utf8'
    )
    const layoutSource = readFileSync(
      join(process.cwd(), 'src/features/manual/components/ManualLayout.tsx'),
      'utf8'
    )

    expect(layoutSource).toMatch(/useManualUrlActions\(\{/)
    expect(hookSource).toMatch(/urlAction !== 'preview'/)
    expect(hookSource).toMatch(/urlAction !== 'download'/)
    expect(hookSource).toMatch(/handlePreview\(\)/)
    expect(hookSource).toMatch(/void handleExport\(\)/)
    expect(hookSource).toMatch(/downloadHandledForRef\.current === attestReportId/)
    expect(hookSource).toMatch(/previewHandledForRef\.current === attestReportId/)
  })

  it('gates sign and approve overflow actions to advisor calculator mode', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/features/manual/components/ManualLayout.tsx'),
      'utf8'
    )

    expect(source).toMatch(
      /useManualReportAttestation\(\{[\s\S]*enabled:\s*[\s\S]*showFullAdvisorMethodNav && isAccountantMode/
    )
    expect(source).toMatch(
      /useManualReportApproval\(\{[\s\S]*enabled: showFullAdvisorMethodNav && isAccountantMode/
    )
    expect(source).toMatch(/transientFailedDescription: t\('approveValuationTransientFailed'\)/)
  })
})
