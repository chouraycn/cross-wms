import * as React from 'react'
import { Card as MuiCard, Box, Typography } from '@mui/material'
import type { SxProps } from '@mui/material/styles'

import { cn } from './utils'

// 表面统一为 MUI Card（outlined，圆角/描边与主程序一致）；内部子件保留 shadcn 的
// data-slot 标记 + Tailwind 布局类，确保消费组件 className 透传行为不变。
function Card({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<'div'> & { size?: 'default' | 'sm'; sx?: SxProps }) {
  return (
    <MuiCard
      variant="outlined"
      data-slot="card"
      data-size={size}
      className={cn(className)}
      sx={{ borderRadius: 2, overflow: 'hidden', bgcolor: 'background.paper' }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'> & { sx?: SxProps }) {
  return (
    <Box
      data-slot="card-header"
      className={cn('flex flex-col gap-1 px-4 pt-4', className)}
      {...(props as Record<string, unknown>)}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'> & { sx?: SxProps }) {
  return (
    <Typography
      data-slot="card-title"
      className={cn(className)}
      variant="subtitle1"
      sx={{ fontWeight: 600, lineHeight: 1.3 }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'> & { sx?: SxProps }) {
  return (
    <Typography
      data-slot="card-description"
      className={cn(className)}
      variant="body2"
      color="text.secondary"
      {...(props as Record<string, unknown>)}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<'div'> & { sx?: SxProps }) {
  return (
    <Box
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...(props as Record<string, unknown>)}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'> & { sx?: SxProps }) {
  return (
    <Box
      data-slot="card-content"
      className={cn('px-4 py-3', className)}
      {...(props as Record<string, unknown>)}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'> & { sx?: SxProps }) {
  return (
    <Box
      data-slot="card-footer"
      className={cn('flex items-center gap-2 border-t px-4 py-3', className)}
      sx={{ borderColor: 'divider' }}
      {...(props as Record<string, unknown>)}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
