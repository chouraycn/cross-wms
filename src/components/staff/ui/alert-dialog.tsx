import * as React from 'react'
import { Dialog as MuiDialog, Box } from '@mui/material'

import { cn } from './utils'
import { Button } from './button'

type AlertDialogContextValue = { open: boolean; setOpen: (o: boolean) => void }
const AlertDialogContext = React.createContext<AlertDialogContextValue>({
  open: false,
  setOpen: () => {},
})

interface AlertDialogProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
  className?: string
  [key: string]: unknown
}

function AlertDialog({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children,
  ...rest
}: AlertDialogProps) {
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

  return (
    <AlertDialogContext.Provider value={{ open, setOpen }}>
      <MuiDialog open={open} onClose={(_e, _r) => setOpen(false)} {...rest}>
        {children}
      </MuiDialog>
    </AlertDialogContext.Provider>
  )
}

function AlertDialogTrigger({ asChild = false, children, ...props }: { asChild?: boolean } & React.ComponentProps<'button'>) {
  const { setOpen } = React.useContext(AlertDialogContext)
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement
    return React.cloneElement(child, {
      onClick: (e: React.MouseEvent) => {
        ;(child.props as { onClick?: (e: React.MouseEvent) => void }).onClick?.(e)
        setOpen(true)
      },
    } as Record<string, unknown>)
  }
  return (
    <button type="button" onClick={() => setOpen(true)} {...props}>
      {children}
    </button>
  )
}

// MUI Dialog 自身已 portal 到 body 并提供 backdrop，Portal/Overlay 仅作 API 兼容占位。
function AlertDialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}
function AlertDialogOverlay() {
  return null
}

function AlertDialogContent({
  className,
  size = 'default',
  children,
  ...props
}: React.ComponentProps<'div'> & { size?: 'default' | 'sm' }) {
  return (
    <Box
      data-slot="alert-dialog-content"
      data-size={size}
      className={cn('p-4', className)}
      sx={{
        position: 'relative',
        borderRadius: 3,
        maxWidth: size === 'sm' ? 320 : 360,
        mx: 'auto',
        width: '100%',
      }}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </Box>
  )
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <Box
      component="div"
      data-slot="alert-dialog-header"
      className={cn('flex flex-col gap-1.5 text-center sm:text-left', className)}
      {...(props as Record<string, unknown>)}
    />
  )
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <Box
      component="div"
      data-slot="alert-dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...(props as Record<string, unknown>)}
    />
  )
}

function AlertDialogMedia({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <Box
      component="div"
      data-slot="alert-dialog-media"
      className={cn('mb-2 inline-flex size-10 items-center justify-center rounded-md bg-muted', className)}
      {...(props as Record<string, unknown>)}
    />
  )
}

function AlertDialogTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <Box
      component="div"
      data-slot="alert-dialog-title"
      className={cn('text-base font-medium', className)}
      sx={{ fontWeight: 500 }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function AlertDialogDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <Box
      component="div"
      data-slot="alert-dialog-description"
      className={cn('text-sm', className)}
      sx={{ fontSize: '0.875rem', color: 'text.secondary' }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function AlertDialogAction({ className, onClick, children, ...props }: React.ComponentProps<typeof Button>) {
  const { setOpen } = React.useContext(AlertDialogContext)
  return (
    <Button
      className={cn(className)}
      onClick={(e) => {
        onClick?.(e as unknown as React.MouseEvent<HTMLButtonElement>)
        setOpen(false)
      }}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </Button>
  )
}

function AlertDialogCancel({ className, onClick, children, ...props }: React.ComponentProps<typeof Button>) {
  const { setOpen } = React.useContext(AlertDialogContext)
  return (
    <Button
      variant="outline"
      className={cn(className)}
      onClick={(e) => {
        onClick?.(e as unknown as React.MouseEvent<HTMLButtonElement>)
        setOpen(false)
      }}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </Button>
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
