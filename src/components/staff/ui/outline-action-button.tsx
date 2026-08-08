import * as React from 'react'
import { Button as MuiButton } from '@mui/material'
import type { SxProps } from '@mui/material/styles'

import { staffTokens } from '../lib/staffTokens.js'

type OutlineActionButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  size?: 'md' | 'sm'
  sx?: SxProps
}

/**
 * 描边操作按钮（toolbar / card header）。样式来自 staffTokens.outlineActionButton
 * （md）或 outlineActionButtonSm（sm），统一到主程序靛蓝主题，替代原 Tailwind
 * OUTLINE_ACTION_BUTTON_CLASS。
 */
export const OutlineActionButton = React.forwardRef<HTMLButtonElement, OutlineActionButtonProps>(
  function OutlineActionButton({ size = 'md', sx, children, className, ...props }, ref) {
    const token = size === 'sm' ? staffTokens.outlineActionButtonSm : staffTokens.outlineActionButton
    return (
      <MuiButton
        ref={ref}
        variant="text"
        color="inherit"
        className={className}
        sx={[token, ...(sx ? [sx] : [])] as SxProps}
        {...(props as Record<string, any>)}
      >
        {children}
      </MuiButton>
    )
  },
)
