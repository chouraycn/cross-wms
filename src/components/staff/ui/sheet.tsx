import * as React from 'react'
import { Drawer as MuiDrawer, Box } from '@mui/material'
import { XIcon } from 'lucide-react'
import type { SxProps, Theme } from '@mui/material/styles'

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
  sx,
  children,
  side = 'right',
  showCloseButton = true,
  ...props
}: React.ComponentProps<'div'> & {
  side?: 'top' | 'right' | 'bottom' | 'left'
  showCloseButton?: boolean
  sx?: SxProps<Theme>
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
          className={className}
          sx={{
            display: 'flex',
            height: '100%',
            flexDirection: 'column',
            gap: '16px',
            fontSize: '14px',
            p: 2,
            ...(sx as object),
          }}
        >
          {children}
          {showCloseButton && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setOpen(false)}
              sx={{ position: 'absolute', top: '12px', right: '12px' }}
              aria-label="Close"
            >
              <XIcon />
              <Box
                component="span"
                sx={{
                  position: 'absolute',
                  width: '1px',
                  height: '1px',
                  padding: 0,
                  margin: '-1px',
                  overflow: 'hidden',
                  clip: 'rect(0,0,0,0)',
                  whiteSpace: 'nowrap',
                  border: 0,
                }}
              >
                Close
              </Box>
            </Button>
          )}
        </Box>
      </MuiDrawer>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <Box component="div" data-slot="sheet-header" className={className} sx={{ display: 'flex', flexDirection: 'column', gap: '2px', p: '16px' }} {...(props as Record<string, unknown>)} />
}
function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <Box component="div" data-slot="sheet-footer" className={className} sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', p: '16px' }} {...(props as Record<string, unknown>)} />
}
function SheetTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <Box component="div" data-slot="sheet-title" className={className} sx={{ fontSize: '16px', fontWeight: 500 }} {...(props as Record<string, unknown>)} />
}
function SheetDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <Box component="div" data-slot="sheet-description" className={className} sx={{ fontSize: '14px', color: 'var(--muted-foreground, #6d726e)' }} {...(props as Record<string, unknown>)} />
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
