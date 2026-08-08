import * as React from 'react'
import { Box } from '@mui/material'
import type { SxProps } from '@mui/material/styles'

import { cn } from './utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'> & { sx?: SxProps }) {
  return (
    <Box
      component="textarea"
      data-slot="textarea"
      className={cn(
        'flex min-h-16 w-full overflow-y-auto rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      sx={{
        borderColor: 'divider',
        '&:focus': { borderColor: 'primary.main', boxShadow: '0 0 0 2px rgba(25,118,210,0.2)' },
        '&:disabled': { bgcolor: 'action.disabledBackground' },
      }}
      {...(props as Record<string, any>)}
    />
  )
}

export { Textarea }
