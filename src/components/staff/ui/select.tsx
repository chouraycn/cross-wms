import * as React from 'react'
import { Select as MuiSelect, MenuItem as MuiMenuItem, Divider as MuiDivider, Box } from '@mui/material'
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from 'lucide-react'

import { cn } from './utils'
import { staffTokens } from '../lib/staffTokens.js'

// 统一到 MUI：Select 映射为 MUI Select（context 受控）。
// SelectContent 将其 items 注册到 context，SelectTrigger 渲染 MUI Select + renderValue 显示选中标签。
type SelectCtxValue = {
  value: unknown
  setValue: (v: unknown) => void
  items: React.ReactNode
  setItems: (n: React.ReactNode) => void
  placeholder: React.ReactNode
  setPlaceholder: (p: React.ReactNode) => void
  disabled: boolean
}
const SelectCtx = React.createContext<SelectCtxValue | null>(null)

function renderDisplay(val: unknown, items: React.ReactNode, placeholder: React.ReactNode) {
  if (val == null || val === '') return <span className="text-muted-foreground">{placeholder}</span>
  const arr = React.Children.toArray(items) as React.ReactElement[]
  const found = arr.find((it) => (it as React.ReactElement)?.props?.value === val)
  return found ? (found.props as { children?: React.ReactNode }).children : (val as React.ReactNode)
}

function Select({ value, defaultValue, onValueChange, disabled, children }: {
  value?: string
  defaultValue?: string
  onValueChange?: (v: string) => void
  disabled?: boolean
  children?: React.ReactNode
}) {
  const [internal, setInternal] = React.useState<string | undefined>(defaultValue)
  const current = value !== undefined ? value : internal
  const setValue = React.useCallback(
    (v: unknown) => {
      if (value === undefined) setInternal(v as string)
      onValueChange?.(v as string)
    },
    [value, onValueChange],
  )
  const [items, setItems] = React.useState<React.ReactNode>(null)
  const [placeholder, setPlaceholder] = React.useState<React.ReactNode>(null)
  return (
    <SelectCtx.Provider value={{ value: current, setValue, items, setItems, placeholder, setPlaceholder, disabled: !!disabled }}>
      {children}
    </SelectCtx.Provider>
  )
}

function SelectGroup({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <Box component="div" data-slot="select-group" className={cn('scroll-my-1 p-1', className)} {...(props as Record<string, unknown>)}>
      {children}
    </Box>
  )
}

function SelectValue({ placeholder, children }: { placeholder?: React.ReactNode; children?: React.ReactNode }) {
  const ctx = React.useContext(SelectCtx)
  React.useEffect(() => {
    ctx?.setPlaceholder(placeholder ?? children ?? null)
  }, [ctx, placeholder, children])
  return null
}

function SelectTrigger({ className, size = 'default', children, ...props }: { size?: 'sm' | 'default' } & React.ComponentProps<'button'>) {
  const ctx = React.useContext(SelectCtx)
  if (!ctx) return null
  return (
    <Box className="w-fit">
      <MuiSelect
        value={ctx.value ?? ''}
        onChange={(e) => ctx.setValue(e.target.value)}
        displayEmpty
        disabled={ctx.disabled}
        IconComponent={ChevronDownIcon}
        size={size === 'sm' ? 'small' : 'medium'}
        data-slot="select-trigger"
        data-size={size}
        sx={staffTokens.selectTrigger}
        className={className}
        renderValue={(v) => renderDisplay(v, ctx.items, ctx.placeholder)}
        {...(props as Record<string, unknown>)}
      >
        {ctx.items}
      </MuiSelect>
      <Box sx={{ display: 'none' }}>{children}</Box>
    </Box>
  )
}

function SelectContent({ children, ...props }: React.ComponentProps<'div'>) {
  const ctx = React.useContext(SelectCtx)
  React.useEffect(() => {
    ctx?.setItems(children)
    return () => ctx?.setItems(null)
  }, [ctx, children])
  void props
  return null
}

function SelectLabel({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <MuiMenuItem disabled data-slot="select-label" className={cn('px-1.5 py-1 text-xs text-muted-foreground', className)} {...(props as Record<string, unknown>)}>
      {children}
    </MuiMenuItem>
  )
}

function SelectItem({ className, children, value, ...props }: { value: string } & React.ComponentProps<'div'>) {
  const ctx = React.useContext(SelectCtx)
  const selected = ctx?.value === value
  return (
    <MuiMenuItem
      value={value}
      selected={!!selected}
      data-slot="select-item"
      className={cn('relative flex w-full items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm', className)}
      {...(props as Record<string, unknown>)}
    >
      <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" data-slot="select-item-indicator">
        {selected ? <CheckIcon className="pointer-events-none" /> : null}
      </span>
      {children}
    </MuiMenuItem>
  )
}

function SelectSeparator({ className, ...props }: React.ComponentProps<'div'>) {
  return <MuiDivider data-slot="select-separator" className={cn(className)} {...(props as Record<string, unknown>)} />
}

function SelectScrollUpButton({ className, ...props }: React.ComponentProps<'button'>) {
  void className
  void props
  return null
}
function SelectScrollDownButton({ className, ...props }: React.ComponentProps<'button'>) {
  void className
  void props
  return null
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
