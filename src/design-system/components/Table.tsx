'use client'

/**
 * Aurora by Upswitch Design System
 * Table Component
 *
 * Data table with sorting, filtering, row selection,
 * and animated interactions.
 */

import { cva, type VariantProps } from 'class-variance-authority'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, ChevronsUpDown, ChevronUp, Search, X } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/design-system/utils'

// ─────────────────────────────────────────
// VARIANTS
// ─────────────────────────────────────────

const tableVariants = cva('w-full caption-bottom text-sm', {
  variants: {
    variant: {
      default: '',
      bordered: 'border border-foreground/10 rounded-xl overflow-hidden',
      striped: '',
    },
    size: {
      sm: 'text-xs',
      md: 'text-sm',
      lg: 'text-base',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'md',
  },
})

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export type SortDirection = 'asc' | 'desc' | null

export interface Column<T> {
  id: string
  header: React.ReactNode
  accessorKey?: keyof T
  accessorFn?: (row: T) => React.ReactNode
  sortable?: boolean
  filterable?: boolean
  width?: string | number
  align?: 'left' | 'center' | 'right'
  cell?: (row: T, index: number) => React.ReactNode
}

export interface TableProps<T> extends VariantProps<typeof tableVariants> {
  data: T[]
  columns: Column<T>[]
  selectable?: boolean
  selectedRows?: string[]
  onSelectionChange?: (selectedIds: string[]) => void
  getRowId?: (row: T) => string
  onRowClick?: (row: T) => void
  sortColumn?: string
  sortDirection?: SortDirection
  onSort?: (columnId: string, direction: SortDirection) => void
  className?: string
  emptyMessage?: string
  loading?: boolean
}

export interface TableHeaderProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  sortable?: boolean
  sortDirection?: SortDirection
  onSort?: () => void
}

// ─────────────────────────────────────────
// BASE TABLE COMPONENTS
// ─────────────────────────────────────────

const TableRoot = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & VariantProps<typeof tableVariants>
>(({ className, variant, size, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table ref={ref} className={cn(tableVariants({ variant, size }), className)} {...props} />
  </div>
))
TableRoot.displayName = 'TableRoot'

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn('bg-foreground/[0.03] border-b border-foreground/10', className)}
    {...props}
  />
))
TableHeader.displayName = 'TableHeader'

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
))
TableBody.displayName = 'TableBody'

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn('border-t border-foreground/10 bg-foreground/[0.03] font-medium', className)}
    {...props}
  />
))
TableFooter.displayName = 'TableFooter'

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }
>(({ className, selected, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'border-b border-foreground/10 transition-colors',
      'hover:bg-foreground/[0.03]',
      selected && 'bg-primary/5 hover:bg-primary/10',
      className
    )}
    {...props}
  />
))
TableRow.displayName = 'TableRow'

const TableHead = React.forwardRef<HTMLTableCellElement, TableHeaderProps>(
  ({ className, sortable, sortDirection, onSort, children, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'h-11 px-4 text-left align-middle font-medium text-foreground/60',
        '[&:has([role=checkbox])]:pr-0',
        sortable && 'cursor-pointer select-none hover:text-foreground transition-colors',
        className
      )}
      onClick={sortable ? onSort : undefined}
      {...props}
    >
      <div className="flex items-center gap-2">
        {children}
        {sortable && (
          <span className="text-foreground/40">
            {sortDirection === 'asc' ? (
              <ChevronUp className="w-4 h-4" />
            ) : sortDirection === 'desc' ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronsUpDown className="w-4 h-4" />
            )}
          </span>
        )}
      </div>
    </th>
  )
)
TableHead.displayName = 'TableHead'

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      'px-4 py-3 align-middle text-foreground/80',
      '[&:has([role=checkbox])]:pr-0',
      className
    )}
    {...props}
  />
))
TableCell.displayName = 'TableCell'

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn('mt-4 text-sm text-foreground/50', className)} {...props} />
))
TableCaption.displayName = 'TableCaption'

// ─────────────────────────────────────────
// CHECKBOX COMPONENT
// ─────────────────────────────────────────

interface TableCheckboxProps {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
  className?: string
}

const TableCheckbox: React.FC<TableCheckboxProps> = ({
  checked,
  indeterminate,
  onChange,
  className,
}) => (
  <button
    role="checkbox"
    aria-checked={indeterminate ? 'mixed' : checked}
    onClick={(e) => {
      e.stopPropagation()
      onChange()
    }}
    className={cn(
      'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
      checked || indeterminate
        ? 'bg-primary border-primary text-primary-foreground'
        : 'border-foreground/30 hover:border-primary/50',
      className
    )}
  >
    {checked && <Check className="w-3.5 h-3.5" />}
    {indeterminate && !checked && <div className="w-2.5 h-0.5 bg-primary-foreground rounded" />}
  </button>
)

// ─────────────────────────────────────────
// FILTER INPUT
// ─────────────────────────────────────────

export interface TableFilterProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

const TableFilter: React.FC<TableFilterProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  className,
}) => (
  <div className={cn('relative', className)}>
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'w-full pl-10 pr-10 py-2 rounded-lg',
        'bg-foreground/[0.03] border border-foreground/10',
        'text-foreground placeholder:text-foreground/40',
        'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50',
        'transition-all'
      )}
    />
    {value && (
      <button
        onClick={() => onChange('')}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
)
TableFilter.displayName = 'TableFilter'

// ─────────────────────────────────────────
// MAIN DATA TABLE COMPONENT
// ─────────────────────────────────────────

function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  selectable = false,
  selectedRows = [],
  onSelectionChange,
  getRowId = (row) => String(row.id),
  onRowClick,
  sortColumn,
  sortDirection,
  onSort,
  variant,
  size,
  className,
  emptyMessage = 'No data available',
  loading = false,
}: TableProps<T>) {
  const allSelected = data.length > 0 && selectedRows.length === data.length
  const someSelected = selectedRows.length > 0 && selectedRows.length < data.length

  const handleSelectAll = () => {
    if (onSelectionChange) {
      if (allSelected) {
        onSelectionChange([])
      } else {
        onSelectionChange(data.map(getRowId))
      }
    }
  }

  const handleSelectRow = (rowId: string) => {
    if (onSelectionChange) {
      if (selectedRows.includes(rowId)) {
        onSelectionChange(selectedRows.filter((id) => id !== rowId))
      } else {
        onSelectionChange([...selectedRows, rowId])
      }
    }
  }

  const handleSort = (columnId: string) => {
    if (onSort) {
      let newDirection: SortDirection = 'asc'
      if (sortColumn === columnId) {
        if (sortDirection === 'asc') newDirection = 'desc'
        else if (sortDirection === 'desc') newDirection = null
        else newDirection = 'asc'
      }
      onSort(columnId, newDirection)
    }
  }

  const getCellValue = (row: T, column: Column<T>): React.ReactNode => {
    if (column.cell) {
      return column.cell(row, data.indexOf(row))
    }
    if (column.accessorFn) {
      return column.accessorFn(row)
    }
    if (column.accessorKey) {
      return row[column.accessorKey] as React.ReactNode
    }
    return null
  }

  const alignClass = (align?: 'left' | 'center' | 'right') => {
    if (align === 'center') return 'text-center'
    if (align === 'right') return 'text-right'
    return 'text-left'
  }

  return (
    <TableRoot variant={variant} size={size} className={className}>
      <TableHeader>
        <TableRow>
          {selectable && (
            <TableHead className="w-12">
              <TableCheckbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={handleSelectAll}
              />
            </TableHead>
          )}
          {columns.map((column) => (
            <TableHead
              key={column.id}
              sortable={column.sortable}
              sortDirection={sortColumn === column.id ? sortDirection : null}
              onSort={() => column.sortable && handleSort(column.id)}
              className={alignClass(column.align)}
              style={{ width: column.width }}
            >
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        <AnimatePresence mode="popLayout">
          {loading ? (
            <TableRow>
              <TableCell
                colSpan={columns.length + (selectable ? 1 : 0)}
                className="h-32 text-center"
              >
                <div className="flex items-center justify-center gap-2 text-foreground/50">
                  <motion.div
                    className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                  Loading...
                </div>
              </TableCell>
            </TableRow>
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length + (selectable ? 1 : 0)}
                className="h-32 text-center text-foreground/50"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, index) => {
              const rowId = getRowId(row)
              const isSelected = selectedRows.includes(rowId)

              return (
                <motion.tr
                  key={rowId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.02 }}
                  className={cn(
                    'border-b border-foreground/10 transition-colors',
                    'hover:bg-foreground/[0.03]',
                    isSelected && 'bg-primary/5 hover:bg-primary/10',
                    onRowClick && 'cursor-pointer'
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {selectable && (
                    <TableCell className="w-12">
                      <TableCheckbox checked={isSelected} onChange={() => handleSelectRow(rowId)} />
                    </TableCell>
                  )}
                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      className={alignClass(column.align)}
                      style={{ width: column.width }}
                    >
                      {getCellValue(row, column)}
                    </TableCell>
                  ))}
                </motion.tr>
              )
            })
          )}
        </AnimatePresence>
      </TableBody>
    </TableRoot>
  )
}
DataTable.displayName = 'DataTable'

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
}
