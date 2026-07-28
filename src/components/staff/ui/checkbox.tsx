import * as React from 'react'
import { Checkbox as MuiCheckbox } from '@mui/material'

import { cn } from './utils'

function Checkbox({
  className,
  onCheckedChange,
  checked,
  defaultChecked,
  ...props
}: React.ComponentProps<typeof MuiCheckbox> & {
  onCheckedChange?: (checked: boolean) => void
}) {
  return (
    <MuiCheckbox
      data-slot="checkbox"
      className={cn(className)}
      checked={checked}
      defaultChecked={defaultChecked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      {...(props as Record<string, unknown>)}
    />
  )
}

export { Checkbox }
