import * as React from 'react'
import { Dialog as MuiDialog, Box, IconButton } from '@mui/material'
import type { SxProps } from '@mui/material/styles'
import { X as XIcon } from 'lucide-react'

import { cn } from './utils'

type DialogContextValue = { open: boolean; setOpen: (o: boolean) => void }
const DialogContext = React.createContext<DialogContextValue>({
  open: false,
  setOpen: () => {},
})

interface DialogProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  onClose?: (reason?: 'escapeKeyDown' | 'backdropClick') => void
  children?: React.ReactNode
  className?: string
  [key: string]: unknown
}

function Dialog({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  onClose,
  children,
  ...rest
}: DialogProps) {
  const [internalOpen, setInternalOpen] = React.useState<boolean>(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? (controlledOpen as boolean) : internalOpen

  const setOpen = React.useCallback(
    (o: boolean) => {
      if (!isControlled) setInternalOpen(o)
      onOpenChange?.(o)
    },
    [isControlled, onOpenChange],
  )

  const handleClose = React.useCallback(
    (_e: unknown, reason: 'escapeKeyDown' | 'backdropClick') => {
      setOpen(false)
      onClose?.(reason)
    },
    [setOpen, onClose],
  )

  return (
    <DialogContext.Provider value={{ open, setOpen }}>
      <MuiDialog open={open} onClose={handleClose} {...rest}>
        {children}
      </MuiDialog>
    </DialogContext.Provider>
  )
}

const DialogTrigger = React.forwardRef<HTMLButtonElement, React.ComponentProps<'button'> & { asChild?: boolean }>(
  function DialogTrigger({ asChild = false, children, onClick, ...props }, ref) {
    const { setOpen } = React.useContext(DialogContext)
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement
      return React.cloneElement(child, {
        ref,
        onClick: (e: React.MouseEvent) => {
          ;(child.props as { onClick?: (e: React.MouseEvent) => void }).onClick?.(
            e as React.MouseEvent<HTMLButtonElement>,
          )
          setOpen(true)
        },
      } as Record<string, unknown>)
    }
    return (
      <button
        ref={ref}
        type="button"
        onClick={(e) => {
          onClick?.(e)
          setOpen(true)
        }}
        {...props}
      >
        {children}
      </button>
    )
  },
)

const DialogClose = React.forwardRef<HTMLButtonElement, React.ComponentProps<'button'> & { asChild?: boolean }>(
  function DialogClose({ asChild = false, children, onClick, ...props }, ref) {
    const { setOpen } = React.useContext(DialogContext)
    const handle = (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e)
      setOpen(false)
    }
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement
      return React.cloneElement(child, { ref, onClick: handle } as Record<string, unknown>)
    }
    return (
      <button ref={ref} type="button" onClick={handle} {...props}>
        {children}
      </button>
    )
  },
)

// MUI Dialog 自身已 portal 到 body 并提供 backdrop，Portal/Overlay 仅作 API 兼容占位。
function DialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}
function DialogOverlay() {
  return null
}

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & { showCloseButton?: boolean; sx?: SxProps }
>(function DialogContent({ className, children, showCloseButton = true, ...props }, ref) {
  const { setOpen } = React.useContext(DialogContext)
  return (
    <Box
      ref={ref}
      data-slot="dialog-content"
      className={cn('p-4', className)}
      sx={{ position: 'relative' }}
      {...(props as Record<string, unknown>)}
    >
      {children}
      {showCloseButton && (
        <IconButton
          size="small"
          aria-label="Close"
          sx={{ position: 'absolute', top: 8, right: 8 }}
          onClick={() => setOpen(false)}
        >
          <XIcon size={16} />
        </IconButton>
      )}
    </Box>
  )
})

function DialogHeader({ className, ...props }: React.ComponentProps<'div'> & { sx?: SxProps }) {
  return (
    <Box
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2', className)}
      {...(props as Record<string, unknown>)}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & { showCloseButton?: boolean; sx?: SxProps }) {
  const { setOpen } = React.useContext(DialogContext)
  return (
    <Box
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 px-6 py-3 sm:flex-row sm:justify-end',
        className,
      )}
      {...(props as Record<string, unknown>)}
    >
      {children}
      {showCloseButton && (
        <button type="button" onClick={() => setOpen(false)}>
          Close
        </button>
      )}
    </Box>
  )
}

const DialogTitle = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'> & { sx?: SxProps }>(
  function DialogTitle({ className, ...props }, ref) {
    return (
      <Box
        ref={ref}
        data-slot="dialog-title"
        className={cn('text-base font-medium leading-none', className)}
        {...(props as Record<string, unknown>)}
      />
    )
  },
)

const DialogDescription = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'> & { sx?: SxProps }>(
  function DialogDescription({ className, ...props }, ref) {
    return (
      <Box
        ref={ref}
        data-slot="dialog-description"
        className={cn('text-sm text-muted-foreground', className)}
        {...(props as Record<string, unknown>)}
      />
    )
  },
)

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
