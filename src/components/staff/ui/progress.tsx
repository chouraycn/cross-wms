import * as React from 'react'
import { LinearProgress } from '@mui/material'

import { cn } from './utils'

function Progress({
  className,
  indicatorClassName,
  value,
  ...props
}: React.ComponentProps<'div'> & {
  indicatorClassName?: string
  value?: number
}) {
  return (
    <LinearProgress
      data-slot="progress"
      variant="determinate"
      value={value ?? 0}
      className={cn(className)}
      sx={{ borderRadius: 999, ...(indicatorClassName ? null : {}) }}
      {...(props as Record<string, any>)}
    />
  )
}

export { Progress }
