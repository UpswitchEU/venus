'use client';

/**
 * CurrencyInput -- Euro-formatted text input for accountants
 * 
 * Displays nl-BE thousand separators (dots) while typing.
 * Stores raw number internally, formats display string live.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AuroraInput } from '@/design-system';

const formatter = new Intl.NumberFormat('nl-BE', {
  maximumFractionDigits: 0,
  useGrouping: true,
});

function formatValue(n: number): string {
  if (!n || n <= 0) return '';
  return formatter.format(n);
}

function parseRawDigits(str: string): number {
  const digits = str.replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10);
}

export interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
}

export function CurrencyInput({
  value,
  onChange,
  label,
  placeholder = '1.500.000',
  size = 'sm',
  className,
  disabled,
}: CurrencyInputProps) {
  const [display, setDisplay] = useState(() => formatValue(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplay(formatValue(value));
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const num = parseRawDigits(raw);
      setDisplay(num > 0 ? formatter.format(num) : raw.replace(/\D/g, '') === '' ? '' : '');
      onChange(num);
    },
    [onChange],
  );

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    requestAnimationFrame(() => e.target.select());
  }, []);

  const handleBlur = useCallback(() => {
    const num = parseRawDigits(display);
    setDisplay(formatValue(num));
  }, [display]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text');
      const num = parseRawDigits(pasted);
      setDisplay(num > 0 ? formatter.format(num) : '');
      onChange(num);
    },
    [onChange],
  );

  return (
    <div className={className}>
      <AuroraInput
        ref={inputRef}
        type="text"
        inputMode="numeric"
        label={label}
        value={display}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPaste={handlePaste}
        placeholder={placeholder}
        size={size}
        disabled={disabled}
        leftIcon={
          <span className="text-foreground/40 text-xs font-medium select-none">€</span>
        }
      />
    </div>
  );
}
