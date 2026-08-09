import * as React from 'react'
import { Box } from '@mui/material'
import type { SxProps } from '@mui/material/styles'

import { cn } from './utils'

// 用 MUI Box(component="input") 封装：保留原生 <input> 的 ref/事件语义，
// 同时用 theme token 提供 MUI outlined 输入框外观；className(Tailwind) 仍透传。
function Input({ className, type, ...props }: React.ComponentProps<'input'> & { sx?: SxProps }) {
  return (
    <Box
      component="input"
      type={type}
      data-slot="input"
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      sx={{
        borderColor: 'var(--border)',
        '&:focus': {
          borderColor: 'var(--primary)',
          boxShadow: '0 0 0 2px rgba(15,118,110,0.2)',
        },
        '&:disabled': { bgcolor: 'action.disabledBackground' },
      }}
      {...(props as Record<string, any>)}
    />
  )
}

export { Input }
