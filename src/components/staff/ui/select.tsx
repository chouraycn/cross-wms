import * as React from 'react'
import { Select as MuiSelect, MenuItem as MuiMenuItem, Divider as MuiDivider, Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from 'lucide-react'

import { staffTokens } from '../lib/staffTokens.js'

// 统一到 MUI：Select 映射为 MUI Select（context 受控）。
// SelectContent 将其 items 注册到 context，SelectTrigger 渲染 MUI Select + renderValue 显示选中标签。
type SelectCtxValue = {
  value: any
  setValue: (v: any) => void
  items: React.ReactNode
  setItems: (n: React.ReactNode) => void
  placeholder: React.ReactNode
  setPlaceholder: (p: React.ReactNode) => void
  disabled: boolean
}
const SelectCtx = React.createContext<SelectCtxValue | null>(null)

function renderDisplay(val: any, items: React.ReactNode, placeholder: React.ReactNode) {
  if (val == null || val === '') return <span style={{ color: 'var(--muted-foreground, #6d726e)' }}>{placeholder}</span>
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
    (v: any) => {
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
    <Box component="div" data-slot="select-group" className={className} sx={{ scrollMargin: '4px', p: '4px' }} {...(props as Record<string, any>)}>
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

function SelectTrigger({ className, size = 'default', children, ...props }: { size?: 'sm' | 'default' } & React.ComponentProps<'button'> & { sx?: SxProps<Theme> }) {
  const ctx = React.useContext(SelectCtx)
  if (!ctx) return null
  return (
    <Box sx={{ width: 'fit-content' }}>
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
        {...(props as Record<string, any>)}
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
    <MuiMenuItem disabled data-slot="select-label" className={className} sx={{ px: '6px', py: '4px', fontSize: '12px', color: 'var(--muted-foreground, #6d726e)' }} {...(props as Record<string, any>)}>
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
      className={className}
      sx={{
        position: 'relative',
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        gap: '6px',
        borderRadius: '6px',
        py: '4px',
        pr: '32px',
        pl: '6px',
        fontSize: '14px',
      }}
      {...(props as Record<string, any>)}
    >
      <Box
        component="span"
        sx={{
          pointerEvents: 'none',
          position: 'absolute',
          right: '8px',
          display: 'flex',
          width: '16px',
          height: '16px',
          alignItems: 'center',
          justifyContent: 'center',
          '& svg': { width: '14px', height: '14px' },
        }}
        data-slot="select-item-indicator"
      >
        {selected ? <CheckIcon /> : null}
      </Box>
      {children}
    </MuiMenuItem>
  )
}

function SelectSeparator({ className, ...props }: React.ComponentProps<'div'>) {
  return <MuiDivider data-slot="select-separator" className={className} {...(props as Record<string, any>)} />
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
