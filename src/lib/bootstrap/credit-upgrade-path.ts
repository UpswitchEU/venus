/**
 * Mirrors Titan `credits/constants/credit-upgrade-path.ts` — keep values in sync.
 * Accountant paywall → Mercury billing; client premium → pricing.
 */
export const ACCOUNTANT_CREDIT_UPGRADE_PATH = 'accountant_paid' as const;

export const CLIENT_CREDIT_UPGRADE_PATH = 'client_premium' as const;

export type CreditUpgradePath =
	| typeof ACCOUNTANT_CREDIT_UPGRADE_PATH
	| 'accountant_pro'
	| typeof CLIENT_CREDIT_UPGRADE_PATH;

/**
 * Titan bootstrap `credit_status.upgrade_path` — accountant paywall routes to Mercury billing.
 * `accountant_pro` is legacy; API now emits `accountant_paid`.
 */
export function isAccountantBillingUpgradePath(
	path?: CreditUpgradePath | string | null,
): boolean {
	return (
		path === ACCOUNTANT_CREDIT_UPGRADE_PATH || path === 'accountant_pro'
	);
}

/** Direct / seller flow: insufficient credits → client should upgrade to Premium */
export function isClientPremiumUpgradePath(
	path?: CreditUpgradePath | string | null,
): boolean {
	return path === CLIENT_CREDIT_UPGRADE_PATH;
}
