import * as React from 'react'
import { Popover as MuiPopover, Box } from '@mui/material'

import { cn } from './utils'

// 统一到 MUI：Popover / PopoverTrigger / PopoverContent 映射为 MUI Popover，
// 保留 compound API 与 data-slot；Anchor/Arrow 为占位（Anchor 负责挂载锚点元素）。
type PopoverCtxValue = {
  anchorEl: HTMLElement | null
  setAnchorEl: (el: HTMLElement | null) => void
  open: boolean
  setOpen: (o: boolean) => void
  onOpenChange?: (o: boolean) => void
}
const PopoverCtx = React.createContext<PopoverCtxValue>({
  anchorEl: null,
  setAnchorEl: () => {},
  open: false,
  setOpen: () => {},
  onOpenChange: undefined,
})

function Popover({
  children,
  open: controlledOpen,
  onOpenChange,
  modal,
}: {
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (o: boolean) => void
  modal?: boolean
}) {
  void modal
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
    <PopoverCtx.Provider value={{ anchorEl, setAnchorEl, open, setOpen, onOpenChange }}>
      {children}
    </PopoverCtx.Provider>
  )
}

function PopoverTrigger({
  asChild = false,
  children,
  onClick,
  ...props
}: { asChild?: boolean } & React.ComponentProps<'button'>) {
  const { setAnchorEl, setOpen } = React.useContext(PopoverCtx)
  const open = (el: HTMLElement) => {
    setAnchorEl(el)
    setOpen(true)
  }
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement
    return React.cloneElement(child, {
      'data-slot': 'popover-trigger',
      onClick: (e: React.MouseEvent<HTMLElement>) => {
        ;(child.props as { onClick?: (e: React.MouseEvent<HTMLElement>) => void }).onClick?.(e)
        onClick?.(e as React.MouseEvent<HTMLButtonElement>)
        open(e.currentTarget)
      },
      ...(props as Record<string, unknown>),
    } as Record<string, unknown>)
  }
  return (
    <button
      type="button"
      data-slot="popover-trigger"
      onClick={(e) => {
        onClick?.(e)
        open(e.currentTarget)
      }}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </button>
  )
}

function mapOrigin(
  align: 'start' | 'center' | 'end' = 'center',
  side: 'top' | 'bottom' | 'left' | 'right' = 'bottom',
) {
  const h: 'left' | 'center' | 'right' = align === 'start' ? 'left' : align === 'end' ? 'right' : 'center'
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

function PopoverContent({
  className,
  align = 'center',
  side = 'bottom',
  sideOffset = 4,
  collisionPadding,
  avoidCollisions,
  onInteractOutside,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
  sideOffset?: number
  collisionPadding?: number
  avoidCollisions?: boolean
  onInteractOutside?: (e: Event) => void
}) {
  const { anchorEl, open, setOpen } = React.useContext(PopoverCtx)
  const origin = mapOrigin(align, side)
  void sideOffset
  void collisionPadding
  void avoidCollisions
  void onInteractOutside
  return (
    <MuiPopover
      open={open && !!anchorEl}
      anchorEl={anchorEl}
      onClose={(_e, _r) => setOpen(false)}
      anchorOrigin={origin.anchorOrigin}
      transformOrigin={origin.transformOrigin}
      slotProps={{
        paper: {
          'data-slot': 'popover-content',
          className: cn('rounded-lg shadow-md', className),
          style: { overflow: 'visible' },
        } as Record<string, unknown>,
      }}
      {...(props as Record<string, unknown>)}
    >
      <Box sx={{ p: 1 }}>{children}</Box>
    </MuiPopover>
  )
}

function PopoverAnchor({
  asChild = false,
  children,
  ...props
}: { asChild?: boolean } & React.ComponentProps<'div'>) {
  const { setAnchorEl } = React.useContext(PopoverCtx)
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement
    return React.cloneElement(child, {
      ref: ((el: HTMLElement | null) => setAnchorEl(el)) as unknown as React.Ref<HTMLElement>,
      'data-slot': 'popover-anchor',
    } as Record<string, unknown>)
  }
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    setAnchorEl(ref.current)
    return () => setAnchorEl(null)
  }, [setAnchorEl])
  return <div ref={ref} data-slot="popover-anchor" {...(props as Record<string, unknown>)} />
}

function PopoverArrow({
  width,
  height,
  className,
  ...props
}: React.ComponentProps<'div'> & { width?: number; height?: number }) {
  void width
  void height
  void className
  void props
  return null
}

function PopoverHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <Box component="div" data-slot="popover-header" className={cn('flex flex-col gap-0.5 text-sm', className)} {...(props as Record<string, unknown>)} />
  )
}
function PopoverTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <Box component="div" data-slot="popover-title" className={cn('font-medium', className)} {...(props as Record<string, unknown>)} />
  )
}
function PopoverDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <Box component="p" data-slot="popover-description" className={cn('text-muted-foreground', className)} {...(props as Record<string, unknown>)} />
  )
}

export {
  Popover,
  PopoverAnchor,
  PopoverArrow,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
