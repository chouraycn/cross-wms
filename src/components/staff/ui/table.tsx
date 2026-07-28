import * as React from 'react'
import { Box } from '@mui/material'

import { cn } from './utils'

// 统一到 MUI：保留语义化 table 标签 + data-slot + className 透传，
// 颜色/边框路由到 MUI 主题 token（divider / action.* / text.*），实现设计体系统一。
function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <Box component="div" data-slot="table-container" sx={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
      <Box
        component="table"
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', className)}
        sx={{ width: '100%', captionSide: 'bottom', fontSize: '0.875rem' }}
        {...(props as Record<string, unknown>)}
      />
    </Box>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <Box
      component="thead"
      data-slot="table-header"
      className={cn('[&_tr]:border-b', className)}
      sx={{ '& tr': { borderBottom: '1px solid', borderColor: 'divider' } }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <Box
      component="tbody"
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      sx={{ '& tr:last-child': { borderBottom: 0 } }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <Box
      component="tfoot"
      data-slot="table-footer"
      className={cn('border-t font-medium [&>tr]:last:border-b-0', className)}
      sx={{ borderTop: '1px solid', borderColor: 'divider', bgcolor: 'action.hover', fontWeight: 500, '& tr:last-child': { borderBottom: 0 } }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <Box
      component="tr"
      data-slot="table-row"
      className={cn('transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)}
      sx={{
        borderBottom: '1px solid',
        borderColor: 'divider',
        transition: 'background-color 0.2s',
        '&:hover': { bgcolor: 'action.hover' },
        '&[data-state="selected"]': { bgcolor: 'action.selected' },
      }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <Box
      component="th"
      data-slot="table-head"
      className={cn('h-10 px-2 text-left align-middle font-medium', className)}
      sx={{ height: 40, px: 2, textAlign: 'left', verticalAlign: 'middle', fontWeight: 500, color: 'text.primary' }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <Box
      component="td"
      data-slot="table-cell"
      className={cn('p-2 align-middle', className)}
      sx={{ p: 2, verticalAlign: 'middle' }}
      {...(props as Record<string, unknown>)}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <Box
      component="caption"
      data-slot="table-caption"
      className={cn('mt-4 text-sm', className)}
      sx={{ mt: 4, fontSize: '0.875rem', color: 'text.secondary' }}
      {...(props as Record<string, unknown>)}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
