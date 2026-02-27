/**
 * Aurora Design System Components
 *
 * Export all design system components for easy importing
 */

export type {
  AccordionContentProps,
  AccordionItemProps,
  AccordionProps,
  AccordionTriggerProps,
  SimpleAccordionItem,
  SimpleAccordionProps,
} from './Accordion'
// ─────────────────────────────────────────
// ACCORDION
// ─────────────────────────────────────────
export {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  accordionItemVariants,
  accordionTriggerVariants,
  accordionVariants,
  SimpleAccordion,
} from './Accordion'
export type { AuroraBackgroundProps, AuroraGlowProps } from './AuroraBackground'
// ─────────────────────────────────────────
// AURORA BACKGROUND
// ─────────────────────────────────────────
export { AuroraBackground, AuroraGlow } from './AuroraBackground'
export type { AvatarGroupProps, AvatarProps } from './Avatar'
// ─────────────────────────────────────────
// AVATAR
// ─────────────────────────────────────────
export { Avatar, AvatarGroup, avatarVariants, statusIndicatorVariants } from './Avatar'
export type { BadgeProps, SectionBadgeProps } from './Badge'
// ─────────────────────────────────────────
// BADGE
// ─────────────────────────────────────────
export { Badge, SectionBadge } from './Badge'
export type { AuroraButtonProps } from './Button'
export { AuroraButton } from './Button'
export type { AuroraChatPanelProps, ChatMessage } from './ChatPanel'
// ─────────────────────────────────────────
// CHAT
// ─────────────────────────────────────────
export { AuroraChatInput, AuroraChatPanel } from './ChatPanel'
export type {
  CheckboxGroupProps,
  CheckboxProps,
  RadioGroupProps,
  RadioProps,
} from './Checkbox'
// ─────────────────────────────────────────
// CHECKBOX & RADIO
// ─────────────────────────────────────────
export {
  Checkbox,
  CheckboxGroup,
  checkboxVariants,
  Radio,
  RadioGroup,
  radioVariants,
} from './Checkbox'
export type {
  BusinessType,
  BusinessTypeSearchInputProps,
  KBOCompany,
  KBOSearchInputProps,
} from './EntitySearch'
// ─────────────────────────────────────────
// ENTITY SEARCH (KBO + BUSINESS TYPE)
// ─────────────────────────────────────────
export {
  BusinessTypeSearchInput,
  categoryIcons,
  KBOSearchInput,
} from './EntitySearch'
export {
  AuroraFormAlert,
  AuroraFormGrid,
  AuroraFormSection,
  AuroraFullWidthField,
} from './FormSection'
export type { BentoCardProps, GlassCardProps } from './GlassCard'
// ─────────────────────────────────────────
// GLASS CARD
// ─────────────────────────────────────────
export { BentoCard, GlassCard } from './GlassCard'
export type { AuroraInputProps, PasswordInputProps, SearchInputProps, TextareaProps } from './Input'
// ─────────────────────────────────────────
// FORM INPUTS
// ─────────────────────────────────────────
export { AuroraInput, AuroraTextarea, PasswordInput, SearchInput } from './Input'
// ─────────────────────────────────────────
// LAYOUTS
// ─────────────────────────────────────────
export {
  AuroraCard,
  AuroraPageContainer,
  AuroraPanel,
  AuroraScrollArea,
  AuroraSplitLayout,
} from './Layouts'
export type { ModalContentProps, ModalProps } from './Modal'
// ─────────────────────────────────────────
// MODAL / DIALOG
// ─────────────────────────────────────────
export {
  AnimatedModal,
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  ModalPortal,
  ModalTitle,
  ModalTrigger,
  modalVariants,
} from './Modal'
// ─────────────────────────────────────────
// MOTION PRESETS
// ─────────────────────────────────────────
export {
  createSpring,
  // Duration & Easing
  duration,
  easing,
  fadeInDown,
  // Animation Variants
  fadeInUp,
  hoverGlow,
  // Hover/Tap States
  hoverLift,
  hoverScale,
  scaleIn,
  slideInLeft,
  slideInRight,
  springBouncy,
  // Spring Configurations
  springDefault,
  springGentle,
  springSnappy,
  staggerContainer,
  // Utilities
  staggerDelay,
  staggerFast,
  tapScale,
  // Configuration
  viewportConfig,
} from './motion'
export type { AuroraNumberInputProps } from './NumberInput'
export { AuroraNumberInput } from './NumberInput'
export type {
  CircularProgressProps,
  ProgressProps,
  StepProgressProps,
  StepProgressStep,
} from './Progress'
// ─────────────────────────────────────────
// PROGRESS
// ─────────────────────────────────────────
export {
  CircularProgress,
  Progress,
  progressFillVariants,
  progressTrackVariants,
  StepProgress,
} from './Progress'
// ─────────────────────────────────────────
// RESIZABLE PANELS
// ─────────────────────────────────────────
export {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from './Resizable'
export type {
  SegmentedControlOption,
  SegmentedControlProps,
} from './SegmentedControl'
// ─────────────────────────────────────────
// SEGMENTED CONTROL
// ─────────────────────────────────────────
export { SegmentedControl } from './SegmentedControl'
export type { AuroraSelectProps, SelectGroup, SelectOption, SelectOptions } from './Select'
export { AuroraSelect } from './Select'
export type {
  SkeletonAvatarProps,
  SkeletonButtonProps,
  SkeletonCardProps,
  SkeletonFormProps,
  SkeletonImageProps,
  SkeletonListProps,
  SkeletonProps,
  SkeletonTableProps,
  SkeletonTextProps,
} from './Skeleton'
// ─────────────────────────────────────────
// SKELETON / LOADING
// ─────────────────────────────────────────
export {
  Skeleton,
  SkeletonAvatar,
  SkeletonButton,
  SkeletonCard,
  SkeletonForm,
  SkeletonImage,
  SkeletonList,
  SkeletonTable,
  SkeletonText,
} from './Skeleton'
export type { RangeSliderProps, SliderProps } from './Slider'
// ─────────────────────────────────────────
// SLIDER
// ─────────────────────────────────────────
export { RangeSlider, Slider, sliderThumbVariants, sliderTrackVariants } from './Slider'
export type { SwitchGroupProps, SwitchProps } from './Switch'
// ─────────────────────────────────────────
// SWITCH
// ─────────────────────────────────────────
export { Switch, SwitchGroup, switchThumbVariants, switchTrackVariants } from './Switch'
export type {
  Column,
  SortDirection,
  TableFilterProps,
  TableHeaderProps,
  TableProps,
} from './Table'
// ─────────────────────────────────────────
// TABLE
// ─────────────────────────────────────────
export {
  DataTable,
  TableBody,
  TableCaption,
  TableCell,
  TableFilter,
  TableFooter,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
  tableVariants,
} from './Table'
export type { TabsContentProps, TabsListProps, TabsProps, TabsTriggerProps } from './Tabs'
// ─────────────────────────────────────────
// TABS
// ─────────────────────────────────────────
export { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs'
export type {
  ToastContainerProps,
  ToastData,
  ToastItemProps,
  ToastVariant,
} from './Toast'
// ─────────────────────────────────────────
// TOAST / NOTIFICATIONS
// ─────────────────────────────────────────
export {
  ToastContainer,
  ToastItem,
  toastVariants,
  useDesignSystemToast,
} from './Toast'
export type { TooltipProps, TooltipProviderProps } from './Tooltip'
// ─────────────────────────────────────────
// TOOLTIP
// ─────────────────────────────────────────
export {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from './Tooltip'
export type {
  BodyProps,
  DisplayProps,
  HeadingProps,
  MonoProps,
  TypographyProps,
} from './Typography'
// ─────────────────────────────────────────
// TYPOGRAPHY
// ─────────────────────────────────────────
export {
  Body,
  Caption,
  Display,
  Heading,
  Mono,
  Typography,
  typographyVariants,
} from './Typography'
