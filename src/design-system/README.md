# Aurora Design System

A premium, WCAG AA compliant design system built on Dieter Rams' "Less, but better" philosophy.

## Quick Start

```bash
# Design system is already integrated in Venus
# Components are imported from '@/design-system'
```

## Architecture

```
design-system/
├── index.ts                  # Main export (components, hooks, utils)
├── README.md                 # This file
├── utils.ts                  # cn() utility + formatting helpers
├── tailwind.preset.ts        # Tailwind preset (merge into config)
├── theme.ts                  # Theme configuration
├── components/
│   ├── index.ts              # Component exports
│   ├── AuroraBackground.tsx  # Atmospheric backdrop system
│   ├── GlassCard.tsx         # Glass morphism containers
│   ├── Badge.tsx             # Status badges
│   ├── Button.tsx            # Primary/Secondary/Ghost variants
│   ├── Typography.tsx        # Display/Heading/Body/Caption/Mono
│   ├── Modal.tsx             # Dialog system
│   ├── Toast.tsx             # Notification system
│   ├── Tooltip.tsx           # Tooltip system
│   ├── Tabs.tsx              # Tab navigation
│   ├── Accordion.tsx         # Collapsible sections
│   ├── Skeleton.tsx          # Loading states
│   ├── Progress.tsx          # Progress indicators
│   ├── Switch.tsx            # Toggle switches
│   ├── Checkbox.tsx          # Checkboxes and radios
│   ├── Avatar.tsx            # User avatars
│   ├── Slider.tsx            # Range inputs
│   └── motion.ts             # Framer Motion presets
└── hooks/
    ├── index.ts              # Hook exports
    ├── useReducedMotion.ts   # Accessibility-aware motion
    ├── useSpring.ts          # Physics-based spring utilities
    ├── useStagger.ts         # Staggered animation utilities
    └── useViewportAnimation.ts # Scroll-triggered animations
```

## Core Philosophy

### 60/30/10 Rule

| Weight | Role | Color |
|--------|------|-------|
| **60%** | Dominant Canvas | Deep Slate `hsl(225 18% 8%)` |
| **30%** | Atmosphere | Aurora Teal + Violet (0.06-0.08 opacity) |
| **10%** | Focal Accent | Burnt Clay `hsl(17 50% 59%)` |

### WCAG AA Opacity Hierarchy

```
/10 → Decorative glow layers only
/20 → Dividers, subtle borders
/30 → Decorative elements (no functional text)
/50 → Tertiary text, placeholders (4.5:1 minimum)
/60 → Secondary text, icons, metadata
/75 → Body text, descriptions
/90 → Headlines, high emphasis
```

## Usage

### Import Components

```tsx
import { 
  Button, 
  GlassCard, 
  Typography, 
  Display,
  Modal,
  Toast,
  AuroraBackground,
  useViewportAnimation 
} from '@/design-system';

export function Hero() {
  const { ref, ...motionProps } = useViewportAnimation();
  
  return (
    <AuroraBackground>
      <motion.div ref={ref} {...motionProps}>
        <Display size="xl" gradient>Welcome</Display>
        <Typography variant="body-lg" emphasis="medium">
          Premium design, accessible by default.
        </Typography>
        <Button variant="secondary">Get Started</Button>
      </motion.div>
    </AuroraBackground>
  );
}
```

### Motion System

All animations use physics-based springs for natural feel:

```typescript
import { springDefault, useViewportAnimation } from '@/design-system';

// Default spring (stiff: 170, damping: 26, mass: 1)
// Snappy spring (stiff: 300, damping: 30)
// Gentle spring (stiff: 100, damping: 20)
// Bouncy spring (stiff: 400, damping: 15)
```

### Accessibility

Motion hooks respect `prefers-reduced-motion`:

```typescript
const { ref, isInView, ...animationProps } = useViewportAnimation({
  variant: 'fadeUp',
  spring: 'default',
});
// Automatically disabled for users with motion sensitivity
```

## Component API

### Button

```tsx
<Button variant="primary | secondary | ghost | outline" size="sm | md | lg | icon" loading fullWidth />
```

### Typography

```tsx
<Display size="2xl | xl | lg | md | sm" gradient glow />
<Heading level={1-6} />
<Body size="lg | md | sm" />
<Caption />
<Mono size="lg | md | sm" />
```

### Modal

```tsx
<Modal open={open} onOpenChange={setOpen}>
  <ModalTrigger asChild>
    <Button>Open Modal</Button>
  </ModalTrigger>
  <ModalContent>
    <ModalHeader>
      <ModalTitle>Title</ModalTitle>
      <ModalDescription>Description</ModalDescription>
    </ModalHeader>
    {/* Content */}
    <ModalFooter>
      <Button>Action</Button>
    </ModalFooter>
  </ModalContent>
</Modal>
```

### Toast

```tsx
const { toast, success, error } = useDesignSystemToast();

// Usage
success('Success!', 'Operation completed');
error('Error!', 'Something went wrong');
toast({ variant: 'info', title: 'Info', description: 'FYI' });
```

### GlassCard

```tsx
<GlassCard variant="default | subtle | strong" glow="none | primary | secondary | accent" hover />
```

### AuroraBackground

```tsx
<AuroraBackground intensity="subtle | medium | vibrant" parallax grain vignette />
```

## Brand Palette

| Name | HSL | Hex | Usage |
|------|-----|-----|-------|
| Deep Slate | `225 18% 8%` | `#161A22` | Canvas, backgrounds |
| Aurora Teal | `172 55% 45%` | `#3DBDB0` | Primary actions, tech |
| Aurora Violet | `270 45% 55%` | `#8B5CF6` | Accents, depth |
| Burnt Clay | `17 50% 59%` | `#C87F63` | CTAs, warmth |

## Peer Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `framer-motion` | ^11.0.0 | Physics-based animations |
| `class-variance-authority` | ^0.7.0 | Variant styling |
| `clsx` | ^2.0.0 | Class merging |
| `tailwind-merge` | ^2.0.0 | Tailwind conflict resolution |
| `tailwindcss-animate` | ^1.0.0 | Animation utilities |
| `@radix-ui/react-*` | ^1.0.0 | Accessible primitives |
| `lucide-react` | ^0.400.0 | Icons |

## License

MIT - Use freely in commercial and personal projects.
