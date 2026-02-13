'use client';

/**
 * AuroraBackground - Reusable Atmospheric Backdrop
 * 
 * DESIGN DIRECTION (60-30-10 Rule):
 * ─────────────────────────────────────────────
 * 60% Deep Slate — foundational canvas
 * 30% Teal/Violet Aurora — atmospheric depth
 * 10% Burnt Clay — reserved ONLY for CTAs & metrics
 * 
 * "Less, but better" — Dieter Rams
 * ─────────────────────────────────────────────
 */

import { motion, useScroll, useTransform, MotionStyle } from 'framer-motion';
import { useEffect, useState } from 'react';
import { cn } from '../utils';

export interface AuroraBackgroundProps {
  /** Enable scroll-based parallax effect */
  parallax?: boolean;
  /** Intensity of the aurora glow (0-1) */
  intensity?: 'subtle' | 'medium' | 'vibrant';
  /** Include film grain texture overlay */
  grain?: boolean;
  /** Include vignette effect */
  vignette?: boolean;
  /** Fixed positioning (default) or relative for containers */
  position?: 'fixed' | 'relative' | 'absolute';
  /** Additional class names */
  className?: string;
  /** Z-index for layering */
  zIndex?: number;
  /** Auto-adapt to light/dark mode (default: true) */
  themeAware?: boolean;
}

// Intensity presets for aurora opacity - dark mode
const darkIntensityMap = {
  subtle: { primary: 0.25, secondary: 0.18, tertiary: 0.15 },
  medium: { primary: 0.35, secondary: 0.28, tertiary: 0.22 },
  vibrant: { primary: 0.45, secondary: 0.35, tertiary: 0.30 },
} as const;

// Intensity presets for aurora opacity - light mode (reduced for visibility)
const lightIntensityMap = {
  subtle: { primary: 0.12, secondary: 0.08, tertiary: 0.06 },
  medium: { primary: 0.18, secondary: 0.12, tertiary: 0.09 },
  vibrant: { primary: 0.25, secondary: 0.18, tertiary: 0.14 },
} as const;

export const AuroraBackground = ({
  parallax = true,
  intensity = 'medium',
  grain = true,
  vignette = true,
  position = 'fixed',
  className,
  zIndex = 1,
  themeAware = true,
}: AuroraBackgroundProps) => {
  const [mounted, setMounted] = useState(false);
  const [isLight, setIsLight] = useState(false);
  
  const { scrollYProgress } = useScroll();
  
  // Parallax transforms (only active when parallax is enabled)
  const y1 = useTransform(scrollYProgress, [0, 1], parallax ? ['0%', '-12%'] : ['0%', '0%']);
  const y2 = useTransform(scrollYProgress, [0, 1], parallax ? ['0%', '-18%'] : ['0%', '0%']);
  const y3 = useTransform(scrollYProgress, [0, 1], parallax ? ['0%', '-8%'] : ['0%', '0%']);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Listen for theme changes
  useEffect(() => {
    if (!themeAware || typeof window === 'undefined') return;
    
    const checkTheme = () => {
      setIsLight(document.documentElement.classList.contains('light'));
    };
    
    checkTheme();
    
    // Watch for class changes on documentElement
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    
    return () => observer.disconnect();
  }, [themeAware]);

  // SSR safety - render placeholder on server
  if (!mounted) {
    return (
      <div 
        className={cn(
          "inset-0 overflow-hidden pointer-events-none isolate",
          position,
          className
        )} 
        style={{ zIndex, background: 'hsl(var(--background))' }}
      />
    );
  }

  const intensityMap = isLight ? lightIntensityMap : darkIntensityMap;
  const opacities = intensityMap[intensity];
  
  // Theme-specific colors
  const primaryHue = isLight ? '172 40% 35%' : 'var(--primary)';
  const violetHue = isLight ? '270 35% 55%' : '270 55% 50%';
  const violetSecondary = isLight ? '280 30% 50%' : '280 45% 42%';
  const blendMode = isLight ? 'multiply' : 'screen';

  return (
    <div 
      className={cn(
        "inset-0 overflow-hidden pointer-events-none isolate",
        position,
        className
      )} 
      style={{ zIndex }}
    >
      
      {/* DEEP SLATE CANVAS (60% Dominant) */}
      <div
        className="absolute inset-0"
        style={{ background: 'hsl(var(--background))' }}
      />

      {/* PRIMARY: Teal Curtain */}
      <motion.div
        className="absolute will-change-transform"
        style={{
          width: '170vw',
          height: '70vh',
          background: `radial-gradient(ellipse 85% 60% at 25% 25%, hsl(${primaryHue} / ${opacities.primary}) 0%, hsl(${primaryHue} / ${opacities.tertiary}) 50%, transparent 75%)`,
          filter: 'blur(50px)',
          top: '-15%',
          left: '-35%',
          y: y1,
          mixBlendMode: blendMode,
        } as MotionStyle}
        animate={{ 
          x: ['-2%', '8%', '-2%'], 
          scale: [1, 1.05, 0.98, 1],
        }}
        transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* SECONDARY: Violet Drift */}
      <motion.div
        className="absolute will-change-transform"
        style={{
          width: '150vw',
          height: '60vh',
          background: `radial-gradient(ellipse 70% 55% at 75% 28%, hsl(${violetHue} / ${opacities.secondary}) 0%, hsl(${violetSecondary} / ${opacities.tertiary * 0.5}) 55%, transparent 75%)`,
          filter: 'blur(55px)',
          top: '-5%',
          right: '-28%',
          y: y2,
          mixBlendMode: blendMode,
        } as MotionStyle}
        animate={{ 
          x: ['0%', '-10%', '3%', '0%'], 
          scale: [1, 1.06, 0.96, 1],
        }}
        transition={{ duration: 32, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />

      {/* TERTIARY: Central Teal Glow */}
      <motion.div
        className="absolute will-change-transform"
        style={{
          width: '90vw',
          height: '50vh',
          background: `radial-gradient(ellipse 60% 55% at 50% 38%, hsl(${primaryHue} / ${opacities.tertiary}) 0%, hsl(${primaryHue} / ${opacities.tertiary * 0.4}) 50%, transparent 70%)`,
          filter: 'blur(40px)',
          top: '5%',
          left: '5%',
          y: y3,
          mixBlendMode: blendMode,
        } as MotionStyle}
        animate={{ 
          x: ['0%', '12%', '-4%', '0%'], 
          opacity: [0.8, 1, 0.85, 0.8],
        }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
      />

      {/* ACCENT: Upper Violet */}
      <motion.div
        className="absolute will-change-transform"
        style={{
          width: '100vw',
          height: '40vh',
          background: `radial-gradient(ellipse 55% 50% at 58% 12%, hsl(${violetHue.replace('50%', '48%')} / ${opacities.tertiary}) 0%, hsl(${violetSecondary.replace('42%', '40%')} / ${opacities.tertiary * 0.35}) 55%, transparent 75%)`,
          filter: 'blur(45px)',
          top: '-12%',
          right: '-8%',
          mixBlendMode: blendMode,
        }}
        animate={{ 
          x: ['0%', '-8%', '4%', '0%'], 
          opacity: [0.7, 1, 0.75, 0.7],
        }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut', delay: 5 }}
      />

      {/* SPARKLE: Teal Pulse */}
      <motion.div
        className="absolute will-change-transform"
        style={{
          width: '45vw',
          height: '35vh',
          background: `radial-gradient(ellipse 55% 55% at 50% 50%, hsl(${primaryHue} / ${opacities.secondary}) 0%, transparent 60%)`,
          filter: 'blur(25px)',
          top: '18%',
          left: '28%',
          mixBlendMode: blendMode,
        }}
        animate={{ 
          x: ['0%', '18%', '-6%', '0%'], 
          opacity: [0.5, 0.9, 0.55, 0.5],
          scale: [0.95, 1.1, 0.92, 0.95],
        }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />

      {/* LOWER TEAL GLOW */}
      <motion.div
        className="absolute will-change-transform"
        style={{
          width: '120vw',
          height: '45vh',
          background: `radial-gradient(ellipse 70% 50% at 50% 80%, hsl(${primaryHue} / ${opacities.tertiary * 0.6}) 0%, hsl(${primaryHue} / ${opacities.tertiary * 0.25}) 55%, transparent 75%)`,
          filter: 'blur(60px)',
          bottom: '-10%',
          left: '-10%',
          mixBlendMode: blendMode,
        }}
        animate={{ 
          x: ['0%', '6%', '-4%', '0%'], 
          opacity: [0.6, 0.85, 0.65, 0.6],
        }}
        transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut', delay: 8 }}
      />

      {/* FILM GRAIN */}
      {grain && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: isLight ? 0.008 : 0.015,
            mixBlendMode: 'overlay',
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />
      )}

      {/* VIGNETTE */}
      {vignette && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: isLight
              ? 'radial-gradient(ellipse 140% 110% at 50% 35%, transparent 60%, hsl(var(--background) / 0.2) 100%)'
              : 'radial-gradient(ellipse 140% 110% at 50% 35%, transparent 50%, hsl(var(--background) / 0.35) 100%)',
          }}
        />
      )}
    </div>
  );
};

/**
 * AuroraGlow - Simplified static aurora gradient
 * Use for cards, sections, or smaller containers
 */
export interface AuroraGlowProps {
  /** Position of the glow */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  /** Color variant */
  color?: 'teal' | 'violet' | 'mixed';
  /** Size of the glow */
  size?: 'sm' | 'md' | 'lg';
  /** Additional class names */
  className?: string;
}

const positionMap = {
  'top-left': 'top-0 left-0 -translate-x-1/3 -translate-y-1/3',
  'top-right': 'top-0 right-0 translate-x-1/3 -translate-y-1/3',
  'bottom-left': 'bottom-0 left-0 -translate-x-1/3 translate-y-1/3',
  'bottom-right': 'bottom-0 right-0 translate-x-1/3 translate-y-1/3',
  'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
} as const;

const sizeMap = {
  sm: 'w-48 h-48',
  md: 'w-80 h-80',
  lg: 'w-[32rem] h-[32rem]',
} as const;

const colorMap = {
  teal: 'hsl(var(--primary) / 0.25)',
  violet: 'hsl(270 55% 50% / 0.25)',
  mixed: 'hsl(var(--primary) / 0.20)',
} as const;

export const AuroraGlow = ({
  position = 'top-right',
  color = 'teal',
  size = 'md',
  className,
}: AuroraGlowProps) => {
  return (
    <div
      className={cn(
        "absolute rounded-full pointer-events-none",
        positionMap[position],
        sizeMap[size],
        className
      )}
      style={{
        background: `radial-gradient(circle, ${colorMap[color]} 0%, transparent 70%)`,
        filter: 'blur(40px)',
      }}
    />
  );
};
