import * as React from 'react'
import { Box, type SxProps } from '@mui/material'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from './utils'

// 保留 alertVariants 导出以兼容潜在引用；Alert 渲染统一为 MUI 主题 token 样式。
const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        destructive:
          'bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-current',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

const VARIANT_SX: Record<string, SxProps> = {
  default: {
    bgcolor: 'background.paper',
    color: 'text.primary',
    border: '1px solid',
    borderColor: 'divider',
  },
  destructive: {
    bgcolor: 'error.main',
    color: 'error.contrastText',
    border: '1px solid',
    borderColor: 'error.main',
  },
}

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <Box
      component="div"
      role="alert"
      data-slot="alert"
      className={cn(alertVariants({ variant }), className)}
      sx={VARIANT_SX[variant ?? 'default']}
      {...(props as Record<string, any>)}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <Box
      component="div"
      data-slot="alert-title"
      className={cn(
        'font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground',
        className,
      )}
      sx={{ fontWeight: 500 }}
      {...(props as Record<string, any>)}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <Box
      component="div"
      data-slot="alert-description"
      className={cn(
        'text-sm text-balance md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4',
        className,
      )}
      sx={{ fontSize: '0.875rem', color: 'text.secondary' }}
      {...(props as Record<string, any>)}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <Box
      component="div"
      data-slot="alert-action"
      className={cn('absolute top-2 right-2', className)}
      {...(props as Record<string, any>)}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction }
