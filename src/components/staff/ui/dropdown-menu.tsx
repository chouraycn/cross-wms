import * as React from 'react'
import { Menu as MuiMenu, MenuItem as MuiMenuItem, Divider as MuiDivider, Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { CheckIcon, ChevronRightIcon } from 'lucide-react'

import { cn } from './utils'
import { staffTokens } from '../lib/staffTokens.js'

// 统一到 MUI：DropdownMenu 映射为 MUI Menu（context 受控），保留完整 compound API 与 data-slot。
type MenuCtxValue = {
  anchorEl: HTMLElement | null
  setAnchorEl: (el: HTMLElement | null) => void
  open: boolean
  setOpen: (o: boolean) => void
  onOpenChange?: (o: boolean) => void
}
const MenuCtx = React.createContext<MenuCtxValue>({
  anchorEl: null,
  setAnchorEl: () => {},
  open: false,
  setOpen: () => {},
  onOpenChange: undefined,
})
const SubCtx = React.createContext<{ anchorEl: HTMLElement | null; setAnchorEl: (el: HTMLElement | null) => void }>({
  anchorEl: null,
  setAnchorEl: () => {},
})
const RadioGroupCtx = React.createContext<{ value?: string; onValueChange?: (v: string) => void }>({})

function anchorOriginFor(
  side: 'top' | 'bottom' | 'left' | 'right' = 'bottom',
  align: 'start' | 'center' | 'end' = 'start',
) {
  const h: 'left' | 'center' | 'right' =
    align === 'start' ? 'left' : align === 'end' ? 'right' : 'center'
  if (side === 'top')
    return {
      anchorOrigin: { vertical: 'top' as const, horizontal: h },
      transformOrigin: { vertical: 'bottom' as const, horizontal: h },
    }
  if (side === 'left')
    return {
      anchorOrigin: { vertical: 'center' as const, horizontal: 'left' as const },
      transformOrigin: { vertical: 'center' as const, horizontal: 'right' as const },
    }
  if (side === 'right')
    return {
      anchorOrigin: { vertical: 'center' as const, horizontal: 'right' as const },
      transformOrigin: { vertical: 'center' as const, horizontal: 'left' as const },
    }
  return {
    anchorOrigin: { vertical: 'bottom' as const, horizontal: h },
    transformOrigin: { vertical: 'top' as const, horizontal: h },
  }
}

function DropdownMenu({
  children,
  open: controlledOpen,
  onOpenChange,
}: { children?: React.ReactNode; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? !!controlledOpen : !!anchorEl
  const setOpen = React.useCallback(
    (o: boolean) => {
      if (!isControlled && !o) setAnchorEl(null)
      onOpenChange?.(o)
    },
    [isControlled, onOpenChange],
  )
  return (
    <MenuCtx.Provider value={{ anchorEl, setAnchorEl, open, setOpen, onOpenChange }}>
      {children}
    </MenuCtx.Provider>
  )
}

function DropdownMenuPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function DropdownMenuTrigger({
  asChild = false,
  children,
  ...props
}: { asChild?: boolean } & React.ComponentProps<'button'>) {
  const { setAnchorEl, setOpen } = React.useContext(MenuCtx)
  const open = (el: HTMLElement) => {
    setAnchorEl(el)
    setOpen(true)
  }
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement
    return React.cloneElement(child, {
      'data-slot': 'dropdown-menu-trigger',
      onClick: (e: React.MouseEvent<HTMLElement>) => {
        ;(child.props as { onClick?: (e: React.MouseEvent<HTMLElement>) => void }).onClick?.(e)
        ;(props as { onClick?: (e: React.MouseEvent<HTMLElement>) => void }).onClick?.(e)
        open(e.currentTarget)
      },
    } as Record<string, unknown>)
  }
  return (
    <button
      type="button"
      data-slot="dropdown-menu-trigger"
      onClick={(e) => open(e.currentTarget)}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </button>
  )
}

function DropdownMenuContent({
  className,
  sx,
  align = 'start',
  side = 'bottom',
  sideOffset = 4,
  onCloseAutoFocus,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
  sideOffset?: number
  onCloseAutoFocus?: (e: Event) => void
  sx?: SxProps<Theme>
}) {
  const { anchorEl, open, setOpen } = React.useContext(MenuCtx)
  const origin = anchorOriginFor(side, align)
  void sideOffset
  void onCloseAutoFocus
  return (
    <MuiMenu
      open={open && !!anchorEl}
      anchorEl={anchorEl}
      onClose={() => setOpen(false)}
      {...origin}
      slotProps={{
        paper: {
          'data-slot': 'dropdown-menu-content',
          className,
          sx: [staffTokens.menuContent, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])] as SxProps<Theme>,
          style: { overflow: 'visible' },
        } as Record<string, unknown>,
      }}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </MuiMenu>
  )
}

function DropdownMenuGroup({ children, ...props }: React.ComponentProps<'div'>) {
  return (
    <Box component="div" data-slot="dropdown-menu-group" {...(props as Record<string, unknown>)}>
      {children}
    </Box>
  )
}

function DropdownMenuItem({
  className,
  sx,
  inset,
  variant = 'default',
  disabled,
  onClick,
  onSelect,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  inset?: boolean
  variant?: 'default' | 'destructive'
  disabled?: boolean
  onSelect?: () => void
} & { onClick?: (e: React.MouseEvent<HTMLElement>) => void; sx?: SxProps<Theme> }) {
  const { setOpen } = React.useContext(MenuCtx)
  const baseSx = variant === 'destructive' ? staffTokens.menuItemDanger : staffTokens.menuItem
  return (
    <MuiMenuItem
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      disabled={disabled}
      className={className}
      sx={[baseSx, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])] as SxProps<Theme>}
      onClick={(e) => {
        onSelect?.()
        onClick?.(e)
        setOpen(false)
      }}
      {...(props as Record<string, unknown>)}
    >
      <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" data-slot="dropdown-menu-item-indicator" />
      {children}
    </MuiMenuItem>
  )
}

function DropdownMenuCheckboxItem({
  className,
  inset,
  disabled,
  checked,
  onClick,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  inset?: boolean
  disabled?: boolean
  checked?: boolean
  onClick?: (e: React.MouseEvent<HTMLElement>) => void
}) {
  const { setOpen } = React.useContext(MenuCtx)
  return (
      <MuiMenuItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      disabled={disabled}
      className={className}
      sx={staffTokens.menuItem}
      onClick={(e) => {
        onClick?.(e)
        setOpen(false)
      }}
      {...(props as Record<string, unknown>)}
    >
      <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" data-slot="dropdown-menu-checkbox-item-indicator">
        {checked ? <CheckIcon /> : null}
      </span>
      {children}
    </MuiMenuItem>
  )
}

function DropdownMenuRadioGroup({
  value,
  onValueChange,
  disabled,
  children,
}: {
  value?: string
  onValueChange?: (v: string) => void
  disabled?: boolean
  children?: React.ReactNode
}) {
  void disabled
  return <RadioGroupCtx.Provider value={{ value, onValueChange }}>{children}</RadioGroupCtx.Provider>
}

function DropdownMenuRadioItem({
  className,
  inset,
  disabled,
  value,
  children,
  ...props
}: React.ComponentProps<'div'> & { inset?: boolean; disabled?: boolean; value: string }) {
  const { value: groupValue, onValueChange } = React.useContext(RadioGroupCtx)
  const selected = groupValue === value
  return (
      <MuiMenuItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      disabled={disabled}
      selected={selected}
      className={className}
      sx={staffTokens.menuItem}
      onClick={() => onValueChange?.(value)}
      {...(props as Record<string, unknown>)}
    >
      <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" data-slot="dropdown-menu-radio-item-indicator">
        {selected ? <CheckIcon /> : null}
      </span>
      {children}
    </MuiMenuItem>
  )
}

function DropdownMenuLabel({ className, inset, ...props }: React.ComponentProps<'div'> & { inset?: boolean }) {
  return (
    <Box
      component="div"
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn('px-1.5 py-1 text-xs font-medium text-muted-foreground', className)}
      {...(props as Record<string, unknown>)}
    />
  )
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<'div'>) {
  return <MuiDivider data-slot="dropdown-menu-separator" className={cn(className)} {...(props as Record<string, unknown>)} />
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn('ml-auto text-xs tracking-widest text-muted-foreground', className)}
      {...(props as Record<string, unknown>)}
    />
  )
}

function DropdownMenuSub({ children }: { children?: React.ReactNode }) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null)
  return <SubCtx.Provider value={{ anchorEl, setAnchorEl }}>{children}</SubCtx.Provider>
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<'div'> & { inset?: boolean }) {
  const { setAnchorEl } = React.useContext(SubCtx)
  return (
    <MuiMenuItem
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={className}
      sx={staffTokens.menuItem}
      onMouseEnter={(e) => setAnchorEl(e.currentTarget)}
      {...(props as Record<string, unknown>)}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </MuiMenuItem>
  )
}

function DropdownMenuSubContent({ className, sx, children, ...props }: React.ComponentProps<'div'> & { sx?: SxProps<Theme> }) {
  const { anchorEl, setAnchorEl } = React.useContext(SubCtx)
  return (
    <MuiMenu
      open={!!anchorEl}
      anchorEl={anchorEl}
      onClose={() => setAnchorEl(null)}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{
        paper: {
          'data-slot': 'dropdown-menu-sub-content',
          className,
          sx: [staffTokens.menuContent, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])] as SxProps<Theme>,
          style: { overflow: 'visible' },
        } as Record<string, unknown>,
      }}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </MuiMenu>
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
