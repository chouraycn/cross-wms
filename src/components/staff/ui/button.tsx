import * as React from 'react'
import { Button as MuiButton } from '@mui/material'
import type { SxProps } from '@mui/material/styles'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from './utils'

// 保留 buttonVariants 导出：pagination.tsx 等内部组件仍依赖它生成 className。
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/80',
        outline:
          'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: 'size-8',
        'icon-xs':
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>

function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === 'function') (ref as (n: T | null) => void)(node)
      else (ref as React.MutableRefObject<T | null>).current = node
    }
  }
}

function mapVariant(v: ButtonVariant): {
  variant: 'contained' | 'outlined' | 'text'
  color: 'primary' | 'secondary' | 'error' | 'inherit'
} {
  switch (v) {
    case 'secondary':
      return { variant: 'contained', color: 'secondary' }
    case 'destructive':
      return { variant: 'contained', color: 'error' }
    case 'outline':
      return { variant: 'outlined', color: 'primary' }
    case 'ghost':
      return { variant: 'text', color: 'primary' }
    case 'link':
      return { variant: 'text', color: 'primary' }
    case 'default':
    default:
      return { variant: 'contained', color: 'primary' }
  }
}

const ICON_SIZE_PX: Partial<Record<ButtonSize, number>> = {
  icon: 32,
  'icon-xs': 24,
  'icon-sm': 28,
  'icon-lg': 36,
}

function mapSize(s: ButtonSize): {
  size: 'small' | 'medium' | 'large'
  sx?: React.CSSProperties
} {
  if (s in ICON_SIZE_PX) {
    const px = ICON_SIZE_PX[s as keyof typeof ICON_SIZE_PX]!
    return {
      size: 'small',
      sx: { minWidth: px, width: px, height: px, padding: 0 },
    }
  }
  if (s === 'lg') return { size: 'medium' }
  return { size: 'small' }
}

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean
      sx?: SxProps
    }
>(function Button(
  { className, variant = 'default', size = 'default', asChild = false, children, sx, ...props },
  ref,
) {
  const v = (variant ?? 'default') as ButtonVariant
  const sz = (size ?? 'default') as ButtonSize
  const vMap = mapVariant(v)
  const sMap = mapSize(sz)

  // asChild：把 shadcn 行为保留为“子元素继承按钮样式”（用于 <Button asChild><Link/></Button>）
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement
    return React.cloneElement(child, {
      ref: composeRefs(ref, (child as unknown as { ref?: React.Ref<unknown> }).ref),
      className: cn(buttonVariants({ variant: v, size: sz }), (child.props as { className?: string }).className),
      ...props,
    } as Record<string, unknown>)
  }

  return (
    <MuiButton
      ref={ref}
      variant={vMap.variant}
      color={vMap.color}
      size={sMap.size}
      data-slot="button"
      data-variant={v}
      data-size={sz}
      className={cn(className)}
      sx={{
        textTransform: 'none',
        ...(v === 'link' ? { textDecoration: 'underline' } : null),
        ...(sMap.sx ?? {}),
        ...(sx ?? {}),
      }}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </MuiButton>
  )
})

export { Button, buttonVariants }
