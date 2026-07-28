import * as React from 'react'
import { RadioGroup as MuiRadioGroup, Radio as MuiRadio } from '@mui/material'

import { cn } from './utils'

// 统一到 MUI：RadioGroup/Radio 替代 Radix，保留 value/onValueChange 受控语义与 data-slot。
function RadioGroup({
  className,
  onValueChange,
  value,
  defaultValue,
  ...props
}: Omit<React.ComponentProps<typeof MuiRadioGroup>, 'onChange'> & {
  onValueChange?: (value: string) => void
}) {
  return (
    <MuiRadioGroup
      className={cn('grid w-full gap-2', className)}
      value={value}
      defaultValue={defaultValue}
      onChange={(_e, v) => onValueChange?.(String(v))}
      data-slot="radio-group"
      {...(props as Record<string, unknown>)}
    />
  )
}

function RadioGroupItem({
  className,
  value,
  children,
  ...props
}: React.ComponentProps<typeof MuiRadio> & {
  value: string
  children?: React.ReactNode
}) {
  // MUI Radio 不渲染 children（图标槽由组件内置），保留 children 入参以兼容 API。
  void children
  return (
    <MuiRadio
      value={value}
      data-slot="radio-group-item"
      className={cn(className)}
      {...(props as Record<string, unknown>)}
    />
  )
}

export { RadioGroup, RadioGroupItem }
