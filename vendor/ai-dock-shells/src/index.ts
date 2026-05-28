/**
 * Barrel for the @upswitch/ai-dock-shells package.
 *
 * Three sibling shells + a labelled-field helper + the cn utility. Each
 * shell captures one visual family of propose-only AI cards. See the
 * package README for the family → shell mapping.
 */

export {
	ProposalCardShell,
	type ProposalCardShellProps,
	type ProposalCardTone,
} from './ProposalCardShell';

export {
	FormCardShell,
	type FormCardShellProps,
	type FormCardTone,
} from './FormCardShell';

export {
	BuyerReadyCardShell,
	LabeledField,
	type BuyerReadyCardShellProps,
	type BuyerReadyCardTone,
	type StatusChipTone,
} from './BuyerReadyCardShell';

export { cn } from './cn';
