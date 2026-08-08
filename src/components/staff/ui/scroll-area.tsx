import * as React from 'react'
import { Box } from '@mui/material'

import { cn } from './utils'

// 统一到 MUI：以原生滚动容器（overflow:auto）替代 Radix ScrollArea，
// 保留 data-slot 与 className 透传；原自定义滚动条（ScrollBar）降级为占位，由原生滚动条呈现。
function ScrollArea({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <Box
      component="div"
      data-slot="scroll-area"
      className={cn('relative', className)}
      sx={{ position: 'relative', overflow: 'auto' }}
      {...(props as Record<string, any>)}
    >
      {children}
    </Box>
  )
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<'div'> & { orientation?: 'vertical' | 'horizontal' }) {
  // 占位组件：原生滚动条已由 ScrollArea 的 overflow:auto 提供，无需渲染独立元素。
  void className
  void orientation
  void props
  return null
}

export { ScrollArea, ScrollBar }
