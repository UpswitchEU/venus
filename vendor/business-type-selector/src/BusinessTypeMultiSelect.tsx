'use client';

import type { KeyboardEvent } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface BusinessTypePrimaryMultiple {
	metric?: string | null;
	label?: string | null;
	median?: number | null;
	p25?: number | null;
	p75?: number | null;
	basis?: string | null;
	lowSampleSuppressed?: boolean | null;
}

export interface BusinessTypeOption {
	id: string;
	title: string;
	description?: string | null;
	icon?: string | null;
	categoryId?: string | null;
	categoryLabel?: string | null;
	keywords?: string[];
	popular?: boolean;
	primaryMultiple?: BusinessTypePrimaryMultiple | null;
	naceCodes?: string[];
}

export interface BusinessTypeCategoryOption {
	id: string;
	label: string;
	icon?: string | null;
}

export interface BusinessTypeMultiSelectCopy {
	searchPlaceholder: string;
	selectPlaceholder: string;
	allCategories: string;
	loading: string;
	empty: string;
	popular: string;
	required: string;
	offline: string;
	selectedLabel: string;
	clearSelection: string;
	multipleUnavailable: string;
	lowSampleSuppressed: string;
}

export interface BusinessTypeMultiSelectProps {
	value?: string | string[] | null;
	options: BusinessTypeOption[];
	categories?: BusinessTypeCategoryOption[];
	onChange: (ids: string[], selectedOptions: BusinessTypeOption[]) => void;
	copy: BusinessTypeMultiSelectCopy;
	placeholder?: string;
	disabled?: boolean;
	showCategories?: boolean;
	showSearch?: boolean;
	showPopular?: boolean;
	showMultiples?: boolean;
	loading?: boolean;
	error?: string | null;
	required?: boolean;
	className?: string;
}

function normalizeIds(value: string | string[] | null | undefined): string[] {
	if (Array.isArray(value)) {
		return value.filter((id) => typeof id === 'string' && id.length > 0);
	}
	return typeof value === 'string' && value.length > 0 ? [value] : [];
}

function formatMultiple(
	multiple: BusinessTypePrimaryMultiple | null | undefined
): string | null {
	if (!multiple || multiple.lowSampleSuppressed) return null;
	if (typeof multiple.median !== 'number' || !Number.isFinite(multiple.median))
		return null;

	const label =
		multiple.label || multiple.metric || multiple.basis || 'Multiple';
	const median = `${multiple.median.toFixed(1)}x`;
	const hasBand =
		typeof multiple.p25 === 'number' &&
		Number.isFinite(multiple.p25) &&
		typeof multiple.p75 === 'number' &&
		Number.isFinite(multiple.p75);
	return hasBand
		? `${label} ${median} (${multiple.p25?.toFixed(1)}-${multiple.p75?.toFixed(1)}x)`
		: `${label} ${median}`;
}

function optionMatches(option: BusinessTypeOption, query: string): boolean {
	if (!query) return true;
	const haystack = [
		option.title,
		option.description,
		option.categoryLabel,
		option.categoryId,
		...(option.keywords ?? []),
		...(option.naceCodes ?? []),
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();
	return haystack.includes(query.toLowerCase());
}

export function BusinessTypeMultiSelect({
	value,
	options,
	categories = [],
	onChange,
	copy,
	placeholder,
	disabled = false,
	showCategories = true,
	showSearch = true,
	showPopular = true,
	showMultiples = true,
	loading = false,
	error,
	required = false,
	className = '',
}: BusinessTypeMultiSelectProps) {
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	const [showDropdown, setShowDropdown] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const buttonId = useId();
	const searchId = useId();
	const listboxId = useId();
	const errorId = useId();
	const requiredId = useId();

	const selectedIds = useMemo(() => normalizeIds(value), [value]);
	const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
	const selectedOptions = useMemo(
		() =>
			selectedIds.flatMap(
				(id) => options.find((option) => option.id === id) ?? []
			),
		[options, selectedIds]
	);

	const filteredOptions = useMemo(() => {
		return options.filter((option) => {
			const categoryMatches =
				!selectedCategory || option.categoryId === selectedCategory;
			return categoryMatches && optionMatches(option, searchQuery);
		});
	}, [options, searchQuery, selectedCategory]);

	useEffect(() => {
		if (!showDropdown) return;

		const handlePointerDown = (event: PointerEvent) => {
			if (
				rootRef.current &&
				event.target instanceof Node &&
				!rootRef.current.contains(event.target)
			) {
				setShowDropdown(false);
			}
		};

		document.addEventListener('pointerdown', handlePointerDown);
		return () => document.removeEventListener('pointerdown', handlePointerDown);
	}, [showDropdown]);

	const emitChange = (nextIds: string[]) => {
		const dedupedIds = [...new Set(nextIds)];
		const nextOptions = dedupedIds.flatMap(
			(id) => options.find((option) => option.id === id) ?? []
		);
		onChange(dedupedIds, nextOptions);
	};

	const toggleOption = (option: BusinessTypeOption) => {
		if (disabled) return;
		const nextIds = selectedIdSet.has(option.id)
			? selectedIds.filter((id) => id !== option.id)
			: [...selectedIds, option.id];
		emitChange(nextIds);
	};

	const clearOption = (id: string) => {
		emitChange(selectedIds.filter((selectedId) => selectedId !== id));
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'Escape' && showDropdown) {
			event.preventDefault();
			setShowDropdown(false);
		}
	};

	const describedBy = [
		error ? errorId : null,
		required ? requiredId : null,
	].filter(Boolean);

	return (
		<div
			ref={rootRef}
			className={`business-type-selector ${className}`}
			onKeyDown={handleKeyDown}
		>
			{showSearch && (
				<div className='mb-3'>
					<input
						id={searchId}
						type='text'
						placeholder={copy.searchPlaceholder}
						value={searchQuery}
						onChange={(event) => {
							setSearchQuery(event.target.value);
							if (event.target.value) setSelectedCategory(null);
						}}
						onFocus={() => setShowDropdown(true)}
						aria-autocomplete='list'
						aria-expanded={showDropdown}
						aria-label={copy.searchPlaceholder}
						className='min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0'
						disabled={disabled}
					/>
				</div>
			)}

			{showCategories && categories.length > 0 && (
				<div className='mb-3'>
					<div className='-mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-1 [-webkit-overflow-scrolling:touch] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0'>
						<button
							type='button'
							onClick={() => setSelectedCategory(null)}
							aria-pressed={selectedCategory === null}
							className={`min-h-11 shrink-0 rounded-full px-3 py-1 text-sm sm:min-h-0 ${
								selectedCategory === null
									? 'bg-blue-500 text-white'
									: 'bg-gray-200 text-gray-700 hover:bg-gray-300'
							}`}
							disabled={disabled}
						>
							{copy.allCategories}
						</button>
						{categories.map((category) => (
							<button
								type='button'
								key={category.id}
								onClick={() => setSelectedCategory(category.id)}
								aria-pressed={selectedCategory === category.id}
								className={`min-h-11 shrink-0 rounded-full px-3 py-1 text-sm sm:min-h-0 ${
									selectedCategory === category.id
										? 'bg-blue-500 text-white'
										: 'bg-gray-200 text-gray-700 hover:bg-gray-300'
								}`}
								disabled={disabled}
							>
								{category.icon ? `${category.icon} ` : ''}
								{category.label}
							</button>
						))}
					</div>
				</div>
			)}

			{selectedOptions.length > 0 && (
				<div
					className='mb-3 flex flex-wrap gap-2'
					aria-label={copy.selectedLabel}
				>
					{selectedOptions.map((option) => {
						const multipleLabel = formatMultiple(option.primaryMultiple);
						return (
							<span
								key={option.id}
								className='inline-flex max-w-full items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-sm text-blue-950'
							>
								<span aria-hidden='true'>{option.icon || ''}</span>
								<span className='truncate'>{option.title}</span>
								{showMultiples && multipleLabel && (
									<span className='rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-blue-900'>
										{multipleLabel}
									</span>
								)}
								{option.categoryLabel && (
									<span className='rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] uppercase text-blue-800'>
										{option.categoryLabel}
									</span>
								)}
								<button
									type='button'
									onClick={() => clearOption(option.id)}
									className='ml-1 rounded-full px-1 text-blue-700 hover:bg-blue-100'
									aria-label={`${copy.clearSelection}: ${option.title}`}
									disabled={disabled}
								>
									x
								</button>
							</span>
						);
					})}
				</div>
			)}

			<div className='relative'>
				<button
					id={buttonId}
					type='button'
					onClick={() => setShowDropdown(!showDropdown)}
					disabled={disabled}
					aria-expanded={showDropdown}
					aria-describedby={
						describedBy.length > 0 ? describedBy.join(' ') : undefined
					}
					className={`min-h-11 w-full rounded-md border px-3 py-2 text-left sm:min-h-0 ${
						error ? 'border-red-500' : 'border-gray-300'
					} ${disabled ? 'cursor-not-allowed bg-gray-100' : 'cursor-pointer bg-white'}`}
				>
					{selectedOptions.length > 0 ? (
						<span className='text-gray-900'>
							{selectedOptions.map((option) => option.title).join(', ')}
						</span>
					) : (
						<span className='text-gray-500'>
							{placeholder ?? copy.selectPlaceholder}
						</span>
					)}
				</button>

				{showDropdown && (
					<div
						id={listboxId}
						aria-labelledby={buttonId}
						className='absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg'
					>
						{loading ? (
							<output className='px-3 py-2 text-center text-gray-500'>
								{copy.loading}
							</output>
						) : filteredOptions.length === 0 ? (
							<div className='px-3 py-2 text-center text-gray-500'>
								{copy.empty}
							</div>
						) : (
							filteredOptions.map((option) => {
								const selected = selectedIdSet.has(option.id);
								const multipleLabel = formatMultiple(option.primaryMultiple);
								return (
									<button
										type='button'
										key={option.id}
										onClick={() => toggleOption(option)}
										aria-pressed={selected}
										className='min-h-11 w-full px-3 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none sm:min-h-0'
									>
										<div className='flex items-start gap-3'>
											<span
												aria-hidden='true'
												className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
													selected
														? 'border-blue-500 bg-blue-500 text-white'
														: 'border-gray-300 bg-white text-transparent'
												}`}
											>
												{selected ? 'x' : ''}
											</span>
											<span className='mt-0.5 shrink-0' aria-hidden='true'>
												{option.icon || ''}
											</span>
											<span className='min-w-0 flex-1'>
												<span className='flex flex-wrap items-center gap-2'>
													<span className='font-medium text-gray-900'>
														{option.title}
													</span>
													{option.categoryLabel && (
														<span className='rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase text-gray-600'>
															{option.categoryLabel}
														</span>
													)}
													{showPopular && option.popular && (
														<span className='rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800'>
															{copy.popular}
														</span>
													)}
												</span>
												{option.description && (
													<span className='mt-0.5 block text-sm text-gray-500'>
														{option.description}
													</span>
												)}
												{showMultiples && (
													<span className='mt-1 block text-xs font-medium text-gray-700'>
														{multipleLabel ??
															(option.primaryMultiple?.lowSampleSuppressed
																? copy.lowSampleSuppressed
																: copy.multipleUnavailable)}
													</span>
												)}
											</span>
										</div>
									</button>
								);
							})
						)}
					</div>
				)}
			</div>
			{error && (
				<div id={errorId} className='mt-1 text-sm text-red-600' role='alert'>
					{error}
				</div>
			)}
			{required && (
				<div id={requiredId} className='mt-1 text-sm text-gray-500'>
					{copy.required}
				</div>
			)}
		</div>
	);
}
