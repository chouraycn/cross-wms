import * as React from 'react'
import { Skeleton as MuiSkeleton } from '@mui/material'

import { cn } from './utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <MuiSkeleton
      data-slot="skeleton"
      variant="rounded"
      className={cn(className)}
      {...(props as Record<string, unknown>)}
    />
  )
}

export { Skeleton }
