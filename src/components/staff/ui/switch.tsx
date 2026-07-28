import * as React from 'react'
import { Switch as MuiSwitch } from '@mui/material'

import { cn } from './utils'

function Switch({
  className,
  size = 'default',
  onCheckedChange,
  checked,
  defaultChecked,
  ...props
}: Omit<React.ComponentProps<typeof MuiSwitch>, 'size'> & {
  size?: 'sm' | 'default'
  onCheckedChange?: (checked: boolean) => void
}) {
  return (
    <MuiSwitch
      size={size === 'sm' ? 'small' : 'medium'}
      checked={checked}
      defaultChecked={defaultChecked}
      data-slot="switch"
      data-size={size}
      className={cn(className)}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      {...(props as Record<string, unknown>)}
    />
  )
}

export { Switch }
