import * as React from 'react'
import { Skeleton as MuiSkeleton } from '@mui/material'
import type { SxProps } from '@mui/material/styles'

import { cn } from './utils'

function Skeleton({
  className,
  variant,
  sx,
  ...props
}: React.ComponentProps<'div'> & { variant?: string; sx?: SxProps }) {
  return (
    <MuiSkeleton
      data-slot="skeleton"
      variant={variant === 'rectangular' ? 'rounded' : (variant as 'text' | 'rounded' | 'circular' | undefined) ?? 'rounded'}
      className={cn(className)}
      sx={sx}
      {...(props as Record<string, unknown>)}
    />
  )
}

export { Skeleton }
