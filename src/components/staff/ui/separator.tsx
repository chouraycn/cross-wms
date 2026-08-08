import * as React from 'react'
import { Divider } from '@mui/material'
import type { SxProps } from '@mui/material/styles'

import { cn } from './utils'

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  sx,
  ...props
}: React.ComponentProps<'div'> & {
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
  sx?: SxProps
}) {
  return (
    <Divider
      data-slot="separator"
      orientation={orientation}
      flexItem={orientation === 'vertical'}
      className={cn(className)}
      sx={{ borderColor: 'divider', ...(decorative ? null : {}), ...(sx as Record<string, any>) }}
      {...(props as Record<string, any>)}
    />
  )
}

export { Separator }
