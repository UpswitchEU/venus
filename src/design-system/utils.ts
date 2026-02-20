/**
 * Hybrid Aurora Design System
 * Utility Functions
 * 
 * @module utils
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ─────────────────────────────────────────
// CLASS UTILITIES
// ─────────────────────────────────────────

/**
 * Merge Tailwind classes with clsx
 * Handles conflicts and conditional classes
 * 
 * @example
 * cn('px-4 py-2', isActive && 'bg-primary', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ─────────────────────────────────────────
// FORMATTING UTILITIES
// ─────────────────────────────────────────

/**
 * Format number with locale-aware thousands separator
 * 
 * @example
 * formatNumber(1234567) // "1,234,567"
 * formatNumber(1234567, 'de-DE') // "1.234.567"
 */
export function formatNumber(value: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * Format currency value
 * 
 * @example
 * formatCurrency(50000) // "50.000 €"
 * formatCurrency(50000, 'USD', 'en-US') // "$50,000"
 */
export function formatCurrency(
  value: number,
  currency = 'EUR',
  locale = 'de-DE'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format percentage
 * 
 * @example
 * formatPercent(12.345) // "12.3%"
 * formatPercent(12.345, 2) // "12.35%"
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

// ─────────────────────────────────────────
// MATH UTILITIES
// ─────────────────────────────────────────

/**
 * Clamp a value between min and max
 * 
 * @example
 * clamp(150, 0, 100) // 100
 * clamp(-5, 0, 100) // 0
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values
 * 
 * @example
 * lerp(0, 100, 0.5) // 50
 * lerp(0, 100, 0.25) // 25
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Map a value from one range to another
 * 
 * @example
 * mapRange(50, 0, 100, 0, 1) // 0.5
 * mapRange(75, 0, 100, 0, 255) // 191.25
 */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

// ─────────────────────────────────────────
// SAFE RENDERING
// ─────────────────────────────────────────

/**
 * Coerce to string for safe React rendering.
 * Prevents React error #130 (Objects are not valid as a React child).
 */
export function safeString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && !Number.isNaN(v)) return String(v);
  if (typeof v === 'boolean') return String(v);
  return '';
}

// ─────────────────────────────────────────
// ACCESSIBILITY UTILITIES
// ─────────────────────────────────────────

/**
 * Check if user prefers reduced motion
 * For SSR-safe usage in hooks, prefer useReducedMotion()
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
