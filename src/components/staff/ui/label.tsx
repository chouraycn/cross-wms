import * as React from 'react'
import { Box } from '@mui/material'

import { cn } from './utils'

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <Box
      component="label"
      data-slot="label"
      className={cn('flex items-center gap-2 text-sm font-medium leading-none select-none', className)}
      {...(props as Record<string, unknown>)}
    />
  )
}

export { Label }
