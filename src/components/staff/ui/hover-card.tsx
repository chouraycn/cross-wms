import * as React from 'react'
import { Popover as MuiPopover, Box } from '@mui/material'

import { cn } from './utils'

// 统一到 MUI：HoverCard 映射为 MUI Popover（hover 触发），保留 compound API 与 data-slot。
type HoverCardCtxValue = {
  anchorEl: HTMLElement | null
  setAnchorEl: (el: HTMLElement | null) => void
  open: boolean
  setOpen: (o: boolean) => void
  onOpenChange?: (o: boolean) => void
  openDelay: number
  closeDelay: number
}
const HoverCardCtx = React.createContext<HoverCardCtxValue>({
  anchorEl: null,
  setAnchorEl: () => {},
  open: false,
  setOpen: () => {},
  onOpenChange: undefined,
  openDelay: 700,
  closeDelay: 300,
})

function mapOrigin(
  align: 'start' | 'center' | 'end' = 'center',
  side: 'top' | 'bottom' | 'left' | 'right' = 'bottom',
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

function HoverCard({
  children,
  openDelay = 700,
  closeDelay = 300,
  open: controlledOpen,
  onOpenChange,
  modal,
}: {
  children?: React.ReactNode
  openDelay?: number
  closeDelay?: number
  open?: boolean
  onOpenChange?: (o: boolean) => void
  modal?: boolean
}) {
  void modal
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null)
  const isControlled = controlledOpen !== undefined
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = isControlled ? !!controlledOpen : internalOpen
  const setOpen = React.useCallback(
    (o: boolean) => {
      if (!isControlled) setInternalOpen(o)
      onOpenChange?.(o)
    },
    [isControlled, onOpenChange],
  )
  return (
    <HoverCardCtx.Provider
      value={{ anchorEl, setAnchorEl, open, setOpen, onOpenChange, openDelay, closeDelay }}
    >
      {children}
    </HoverCardCtx.Provider>
  )
}

function HoverCardTrigger({
  asChild = false,
  children,
  ...props
}: { asChild?: boolean } & React.ComponentProps<'button'>) {
  const { setAnchorEl, setOpen, openDelay, closeDelay } = React.useContext(HoverCardCtx)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = (el: HTMLElement) => {
    setAnchorEl(el)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(true), openDelay)
  }
  const hide = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(false), closeDelay)
  }
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement
    return React.cloneElement(child, {
      'data-slot': 'hover-card-trigger',
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
        ;(child.props as { onMouseEnter?: (e: React.MouseEvent<HTMLElement>) => void }).onMouseEnter?.(e)
        show(e.currentTarget)
      },
      onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
        ;(child.props as { onMouseLeave?: (e: React.MouseEvent<HTMLElement>) => void }).onMouseLeave?.(e)
        hide()
      },
      ...(props as Record<string, any>),
    } as Record<string, any>)
  }
  return (
    <button
      type="button"
      data-slot="hover-card-trigger"
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={hide}
      {...(props as Record<string, any>)}
    >
      {children}
    </button>
  )
}

function HoverCardContent({
  className,
  align = 'center',
  side = 'bottom',
  sideOffset = 4,
  collisionPadding,
  avoidCollisions,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
  sideOffset?: number
  collisionPadding?: number
  avoidCollisions?: boolean
}) {
  const { anchorEl, open, setOpen } = React.useContext(HoverCardCtx)
  const origin = mapOrigin(align, side)
  void sideOffset
  void collisionPadding
  void avoidCollisions
  return (
    <MuiPopover
      open={open && !!anchorEl}
      anchorEl={anchorEl}
      onClose={() => setOpen(false)}
      disableRestoreFocus
      anchorOrigin={origin.anchorOrigin}
      transformOrigin={origin.transformOrigin}
      slotProps={{
        paper: {
          'data-slot': 'hover-card-content',
          className: cn('rounded-lg shadow-md', className),
          style: { overflow: 'visible' },
        } as Record<string, any>,
      }}
      {...(props as Record<string, any>)}
    >
      <Box sx={{ p: 0.5 }}>{children}</Box>
    </MuiPopover>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }
