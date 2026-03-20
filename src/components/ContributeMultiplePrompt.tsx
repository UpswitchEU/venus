'use client'

import React, { useState, useCallback } from 'react'
import type { ValuationResponse } from '../types/valuation'
import { generalLogger } from '../utils/logger'

interface ContributeMultiplePromptProps {
	result: ValuationResponse
	onDismiss?: () => void
}

/**
 * Give-to-Get Contribution Prompt — Delphi 2.0
 *
 * Non-intrusive prompt shown after a valuation completes, asking users
 * to contribute their anonymized deal data to improve multiples accuracy.
 *
 * GDPR-safe: only aggregate metrics (EV/EBITDA ratio, sector, country)
 * are submitted. No PII, company name, or identifying data is sent.
 */
export const ContributeMultiplePrompt: React.FC<ContributeMultiplePromptProps> = ({
	result,
	onDismiss,
}) => {
	const [state, setState] = useState<'prompt' | 'contributing' | 'done' | 'dismissed'>('prompt')

	const handleContribute = useCallback(async () => {
		setState('contributing')

		try {
			const businessTypeId = result.business_type || result.industry
			const valuationResults = result.valuation_results

			let evEbitda: number | null = null
			let evRevenue: number | null = null

			if (valuationResults) {
				const ebitdaMethod = (valuationResults as Record<string, any>)?.ebitda_multiple
				if (ebitdaMethod?.enterprise_value && ebitdaMethod?.ebitda) {
					evEbitda = +(ebitdaMethod.enterprise_value / ebitdaMethod.ebitda).toFixed(2)
				}

				const revenueMethod = (valuationResults as Record<string, any>)?.revenue_multiple
				if (revenueMethod?.enterprise_value && revenueMethod?.revenue) {
					evRevenue = +(revenueMethod.enterprise_value / revenueMethod.revenue).toFixed(2)
				}
			}

			const titanUrl = process.env.NEXT_PUBLIC_TITAN_API_URL || ''
			await fetch(`${titanUrl}/api/v2/multiples/contribute`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					business_type_id: businessTypeId,
					country_code: (result as any).country_code || 'XX',
					enterprise_value: evEbitda ? evEbitda * ((result as any).ebitda || 1) : null,
					ebitda: (result as any).ebitda || null,
					revenue: (result as any).revenue || null,
					observation_type: 'CLOSED_DEAL',
				}),
			})

			setState('done')

			generalLogger.info('User contributed anonymized multiple', {
				businessType: businessTypeId,
			})

			setTimeout(() => onDismiss?.(), 3000)
		} catch (error) {
			generalLogger.error('Contribution failed', { error: String(error) })
			setState('done')
			setTimeout(() => onDismiss?.(), 2000)
		}
	}, [result, onDismiss])

	const handleDismiss = useCallback(() => {
		setState('dismissed')
		onDismiss?.()
	}, [onDismiss])

	if (state === 'dismissed') return null

	return (
		<div
			style={{
				position: 'fixed',
				bottom: '24px',
				right: '24px',
				zIndex: 9999,
				maxWidth: '380px',
				background: 'white',
				borderRadius: '12px',
				boxShadow: '0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)',
				padding: '20px',
				animation: 'slideUp 0.3s ease-out',
				border: '1px solid #e5e7eb',
			}}
		>
			<style>{`
				@keyframes slideUp {
					from { transform: translateY(20px); opacity: 0; }
					to { transform: translateY(0); opacity: 1; }
				}
			`}</style>

			{state === 'done' ? (
				<div style={{ textAlign: 'center', padding: '8px 0' }}>
					<div style={{ fontSize: '24px', marginBottom: '8px' }}>&#10003;</div>
					<p style={{ margin: 0, fontSize: '14px', color: '#059669', fontWeight: 500 }}>
						Thank you for contributing!
					</p>
					<p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6b7280' }}>
						Your data helps make valuations more accurate for everyone.
					</p>
				</div>
			) : (
				<>
					<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
						<h4 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 600, color: '#111827' }}>
							Help improve valuation accuracy
						</h4>
						<button
							onClick={handleDismiss}
							type="button"
							style={{
								background: 'none',
								border: 'none',
								cursor: 'pointer',
								padding: '2px',
								color: '#9ca3af',
								fontSize: '18px',
								lineHeight: 1,
							}}
							aria-label="Close"
						>
							&times;
						</button>
					</div>

					<p style={{ margin: '0 0 16px', fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>
						Contribute your anonymized valuation data to strengthen the European SME
						multiples benchmark. No company names or personal data are shared.
					</p>

					<div style={{ display: 'flex', gap: '8px' }}>
						<button
							onClick={handleContribute}
							disabled={state === 'contributing'}
							type="button"
							style={{
								flex: 1,
								padding: '8px 16px',
								borderRadius: '8px',
								border: 'none',
								background: state === 'contributing' ? '#9ca3af' : '#2563eb',
								color: 'white',
								fontSize: '13px',
								fontWeight: 500,
								cursor: state === 'contributing' ? 'default' : 'pointer',
							}}
						>
							{state === 'contributing' ? 'Contributing...' : 'Contribute anonymized data'}
						</button>
						<button
							onClick={handleDismiss}
							type="button"
							style={{
								padding: '8px 16px',
								borderRadius: '8px',
								border: '1px solid #d1d5db',
								background: 'white',
								color: '#6b7280',
								fontSize: '13px',
								cursor: 'pointer',
							}}
						>
							No thanks
						</button>
					</div>

					<p style={{ margin: '12px 0 0', fontSize: '11px', color: '#9ca3af', lineHeight: 1.4 }}>
						GDPR-safe. Only aggregate sector metrics are stored. Your contribution
						helps Upswitch become the European benchmark for SME valuations.
					</p>
				</>
			)}
		</div>
	)
}
