/**
 * Aurora Design System Components
 * 
 * Export all design system components for easy importing
 */

// ─────────────────────────────────────────
// FORM INPUTS
// ─────────────────────────────────────────
export { AuroraInput, PasswordInput, SearchInput, AuroraTextarea } from './Input'
export type { AuroraInputProps, PasswordInputProps, SearchInputProps, TextareaProps } from './Input'

export { AuroraSelect } from './Select'
export type { AuroraSelectProps, SelectOption, SelectGroup, SelectOptions } from './Select'

export { AuroraButton } from './Button'
export type { AuroraButtonProps } from './Button'

export { AuroraNumberInput } from './NumberInput'
export type { AuroraNumberInputProps } from './NumberInput'

export { AuroraFormSection, AuroraFormGrid, AuroraFullWidthField, AuroraFormAlert } from './FormSection'

// ─────────────────────────────────────────
// CHECKBOX & RADIO
// ─────────────────────────────────────────
export {
  Checkbox,
  CheckboxGroup,
  Radio,
  RadioGroup,
  checkboxVariants,
  radioVariants,
} from './Checkbox'
export type {
  CheckboxProps,
  CheckboxGroupProps,
  RadioProps,
  RadioGroupProps,
} from './Checkbox'

// ─────────────────────────────────────────
// SWITCH
// ─────────────────────────────────────────
export { Switch, SwitchGroup, switchTrackVariants, switchThumbVariants } from './Switch'
export type { SwitchProps, SwitchGroupProps } from './Switch'

// ─────────────────────────────────────────
// SLIDER
// ─────────────────────────────────────────
export { Slider, RangeSlider, sliderTrackVariants, sliderThumbVariants } from './Slider'
export type { SliderProps, RangeSliderProps } from './Slider'

// ─────────────────────────────────────────
// CHAT
// ─────────────────────────────────────────
export { AuroraChatPanel, AuroraChatInput } from './ChatPanel'
export type { ChatMessage, AuroraChatPanelProps } from './ChatPanel'

// ─────────────────────────────────────────
// LAYOUTS
// ─────────────────────────────────────────
export { 
  AuroraSplitLayout, 
  AuroraPageContainer, 
  AuroraPanel, 
  AuroraScrollArea, 
  AuroraCard 
} from './Layouts'

// ─────────────────────────────────────────
// MODAL / DIALOG
// ─────────────────────────────────────────
export {
  Modal,
  ModalPortal,
  ModalOverlay,
  ModalClose,
  ModalTrigger,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalTitle,
  ModalDescription,
  AnimatedModal,
  modalVariants,
} from './Modal'
export type { ModalProps, ModalContentProps } from './Modal'

// ─────────────────────────────────────────
// TOAST / NOTIFICATIONS
// ─────────────────────────────────────────
export { 
  ToastItem, 
  ToastContainer, 
  useDesignSystemToast,
  toastVariants,
} from './Toast'
export type { 
  ToastItemProps, 
  ToastContainerProps, 
  ToastData,
  ToastVariant,
} from './Toast'

// ─────────────────────────────────────────
// TOOLTIP
// ─────────────────────────────────────────
export { 
  Tooltip, 
  TooltipProvider, 
  TooltipRoot, 
  TooltipTrigger, 
  TooltipPortal, 
  TooltipContent 
} from './Tooltip'
export type { TooltipProps, TooltipProviderProps } from './Tooltip'

// ─────────────────────────────────────────
// BADGE
// ─────────────────────────────────────────
export { Badge, SectionBadge } from './Badge'
export type { BadgeProps, SectionBadgeProps } from './Badge'

// ─────────────────────────────────────────
// TYPOGRAPHY
// ─────────────────────────────────────────
export {
  Typography,
  Display,
  Heading,
  Body,
  Caption,
  Mono,
  typographyVariants,
} from './Typography'
export type {
  TypographyProps,
  DisplayProps,
  HeadingProps,
  BodyProps,
  MonoProps,
} from './Typography'

// ─────────────────────────────────────────
// SKELETON / LOADING
// ─────────────────────────────────────────
export {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonButton,
  SkeletonCard,
  SkeletonImage,
  SkeletonTable,
  SkeletonList,
  SkeletonForm,
} from './Skeleton'
export type {
  SkeletonProps,
  SkeletonTextProps,
  SkeletonAvatarProps,
  SkeletonButtonProps,
  SkeletonCardProps,
  SkeletonImageProps,
  SkeletonTableProps,
  SkeletonListProps,
  SkeletonFormProps,
} from './Skeleton'

// ─────────────────────────────────────────
// PROGRESS
// ─────────────────────────────────────────
export {
  Progress,
  CircularProgress,
  StepProgress,
  progressTrackVariants,
  progressFillVariants,
} from './Progress'
export type {
  ProgressProps,
  CircularProgressProps,
  StepProgressProps,
  StepProgressStep,
} from './Progress'

// ─────────────────────────────────────────
// TABS
// ─────────────────────────────────────────
export { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs'
export type { TabsProps, TabsListProps, TabsTriggerProps, TabsContentProps } from './Tabs'

// ─────────────────────────────────────────
// ACCORDION
// ─────────────────────────────────────────
export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  SimpleAccordion,
  accordionVariants,
  accordionItemVariants,
  accordionTriggerVariants,
} from './Accordion'
export type {
  AccordionProps,
  AccordionItemProps,
  AccordionTriggerProps,
  AccordionContentProps,
  SimpleAccordionItem,
  SimpleAccordionProps,
} from './Accordion'

// ─────────────────────────────────────────
// GLASS CARD
// ─────────────────────────────────────────
export { GlassCard, BentoCard } from './GlassCard'
export type { GlassCardProps, BentoCardProps } from './GlassCard'

// ─────────────────────────────────────────
// AVATAR
// ─────────────────────────────────────────
export { Avatar, AvatarGroup, avatarVariants, statusIndicatorVariants } from './Avatar'
export type { AvatarProps, AvatarGroupProps } from './Avatar'

// ─────────────────────────────────────────
// AURORA BACKGROUND
// ─────────────────────────────────────────
export { AuroraBackground, AuroraGlow } from './AuroraBackground'
export type { AuroraBackgroundProps, AuroraGlowProps } from './AuroraBackground'

// ─────────────────────────────────────────
// TABLE
// ─────────────────────────────────────────
export {
  TableRoot,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  TableFilter,
  DataTable,
  tableVariants,
} from './Table'
export type {
  Column,
  TableProps,
  TableHeaderProps,
  TableFilterProps,
  SortDirection,
} from './Table'

// ─────────────────────────────────────────
// ENTITY SEARCH (KBO + BUSINESS TYPE)
// ─────────────────────────────────────────
export {
  KBOSearchInput,
  BusinessTypeSearchInput,
} from './EntitySearch'
export type {
  KBOCompany,
  BusinessType,
  KBOSearchInputProps,
  BusinessTypeSearchInputProps,
} from './EntitySearch'

// ─────────────────────────────────────────
// SEGMENTED CONTROL
// ─────────────────────────────────────────
export { SegmentedControl } from './SegmentedControl'
export type {
  SegmentedControlProps,
  SegmentedControlOption,
} from './SegmentedControl'

// ─────────────────────────────────────────
// RESIZABLE PANELS
// ─────────────────────────────────────────
export {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from './Resizable'

// ─────────────────────────────────────────
// MOTION PRESETS
// ─────────────────────────────────────────
export {
  // Spring Configurations
  springDefault,
  springSnappy,
  springGentle,
  springBouncy,
  // Duration & Easing
  duration,
  easing,
  // Animation Variants
  fadeInUp,
  fadeInDown,
  scaleIn,
  slideInLeft,
  slideInRight,
  staggerContainer,
  staggerFast,
  // Hover/Tap States
  hoverLift,
  hoverScale,
  hoverGlow,
  tapScale,
  // Configuration
  viewportConfig,
  // Utilities
  staggerDelay,
  createSpring,
} from './motion'
