import * as React from 'react'
import { Box, type SxProps } from '@mui/material'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from './utils'

// 保留 badgeVariants 导出以兼容潜在引用；Badge 渲染统一为 MUI 主题 token 样式。
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
        secondary:
          'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
        destructive:
          'bg-destructive/10 text-destructive focus-visible:ring-destructive/20 [a]:hover:bg-destructive/20',
        outline:
          'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
        ghost: 'hover:bg-muted hover:text-muted-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>

const VARIANT_STYLE: Record<BadgeVariant, SxProps> = {
  default: { bgcolor: 'primary.main', color: 'primary.contrastText' },
  secondary: { bgcolor: 'secondary.main', color: 'secondary.contrastText' },
  destructive: { bgcolor: 'error.main', color: 'error.contrastText' },
  outline: { bgcolor: 'transparent', color: 'text.primary', border: '1px solid', borderColor: 'divider' },
  ghost: { bgcolor: 'action.hover', color: 'text.primary' },
  link: { bgcolor: 'transparent', color: 'primary.main', textDecoration: 'underline' },
}

function Badge({
  className,
  variant = 'default',
  asChild = false,
  children,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement
    return React.cloneElement(child, {
      className: cn(badgeVariants({ variant }), (child.props as { className?: string }).className),
      ...props,
    } as Record<string, unknown>)
  }
  return (
    <Box
      component="span"
      data-slot="badge"
      data-variant={variant}
      className={cn(className)}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        height: 20,
        borderRadius: 999,
        px: 1,
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        ...VARIANT_STYLE[(variant ?? 'default') as BadgeVariant],
      }}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </Box>
  )
}

export { Badge, badgeVariants }
