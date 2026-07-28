import * as React from 'react'
import { Drawer as MuiDrawer, Box } from '@mui/material'
import { XIcon } from 'lucide-react'

import { cn } from './utils'
import { Button } from './button'

// 统一到 MUI：Sheet 映射为 MUI Drawer（context 受控），保留 compound API 与 data-slot。
type SheetCtxValue = { open: boolean; setOpen: (o: boolean) => void }
const SheetCtx = React.createContext<SheetCtxValue>({ open: false, setOpen: () => {} })

function Sheet({ open, defaultOpen, onOpenChange, children }: {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}) {
  const [internal, setInternal] = React.useState<boolean>(defaultOpen ?? false)
  const isControlled = open !== undefined
  const current = isControlled ? (open as boolean) : internal
  const setOpen = React.useCallback(
    (o: boolean) => {
      if (!isControlled) setInternal(o)
      onOpenChange?.(o)
    },
    [isControlled, onOpenChange],
  )
  return (
    <SheetCtx.Provider value={{ open: current, setOpen }}>{children}</SheetCtx.Provider>
  )
}

function SheetTrigger({ asChild = false, children, ...props }: { asChild?: boolean } & React.ComponentProps<'button'>) {
  const { setOpen } = React.useContext(SheetCtx)
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement
    return React.cloneElement(child, {
      'data-slot': 'sheet-trigger',
      onClick: (e: React.MouseEvent) => {
        ;(child.props as { onClick?: (e: React.MouseEvent) => void }).onClick?.(e)
        setOpen(true)
      },
      ...(props as Record<string, unknown>),
    } as Record<string, unknown>)
  }
  return (
    <button type="button" data-slot="sheet-trigger" onClick={() => setOpen(true)} {...(props as Record<string, unknown>)}>
      {children}
    </button>
  )
}

function SheetClose({ asChild = false, children, ...props }: { asChild?: boolean } & React.ComponentProps<'button'>) {
  const { setOpen } = React.useContext(SheetCtx)
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement
    return React.cloneElement(child, {
      'data-slot': 'sheet-close',
      onClick: (e: React.MouseEvent) => {
        ;(child.props as { onClick?: (e: React.MouseEvent) => void }).onClick?.(e)
        setOpen(false)
      },
      ...(props as Record<string, unknown>),
    } as Record<string, unknown>)
  }
  return (
    <button type="button" data-slot="sheet-close" onClick={() => setOpen(false)} {...(props as Record<string, unknown>)}>
      {children}
    </button>
  )
}

function SheetPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}
function SheetOverlay({ className, ...props }: React.ComponentProps<'div'>) {
  void className
  void props
  return null
}

function SheetContent({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  ...props
}: React.ComponentProps<'div'> & {
  side?: 'top' | 'right' | 'bottom' | 'left'
  showCloseButton?: boolean
}) {
  const { open, setOpen } = React.useContext(SheetCtx)
  const anchor = side === 'top' ? 'top' : side === 'bottom' ? 'bottom' : side === 'left' ? 'left' : 'right'
  return (
    <SheetPortal>
      <MuiDrawer
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          '& .MuiDrawer-paper': {
            width: anchor === 'left' || anchor === 'right' ? '75%' : 'auto',
            maxWidth: { sm: 384 },
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            p: 0,
            bgcolor: 'background.paper',
            boxShadow: 6,
          },
        }}
        {...(props as Record<string, unknown>)}
      >
        <Box
          data-slot="sheet-content"
          data-side={side}
          className={cn('flex h-full flex-col gap-4 text-sm', className)}
          sx={{ p: 2 }}
        >
          {children}
          {showCloseButton && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3"
              aria-label="Close"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          )}
        </Box>
      </MuiDrawer>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <Box component="div" data-slot="sheet-header" className={cn('flex flex-col gap-0.5 p-4', className)} {...(props as Record<string, unknown>)} />
}
function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <Box component="div" data-slot="sheet-footer" className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...(props as Record<string, unknown>)} />
}
function SheetTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <Box component="div" data-slot="sheet-title" className={cn('text-base font-medium', className)} {...(props as Record<string, unknown>)} />
}
function SheetDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <Box component="div" data-slot="sheet-description" className={cn('text-sm text-muted-foreground', className)} {...(props as Record<string, unknown>)} />
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
