import * as React from 'react'
import { Divider } from '@mui/material'

import { cn } from './utils'

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: React.ComponentProps<'div'> & {
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
}) {
  return (
    <Divider
      data-slot="separator"
      orientation={orientation}
      flexItem={orientation === 'vertical'}
      className={cn(className)}
      sx={{ borderColor: 'divider', ...(decorative ? null : {}) }}
      {...(props as Record<string, unknown>)}
    />
  )
}

export { Separator }
