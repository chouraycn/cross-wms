import * as React from 'react'
import { Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'

import { cn } from './utils'

// 统一到 MUI：保留语义化 table 标签 + data-slot + className 透传，
// 颜色/边框路由到 MUI 主题 token（divider / action.* / text.*），实现设计体系统一。
const mergeSx = (base: SxProps<Theme>, sx?: SxProps<Theme>): SxProps<Theme> => [
  base,
  ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
]

function Table({ className, sx, ...props }: React.ComponentProps<'table'> & { sx?: SxProps<Theme> }) {
  return (
    <Box component="div" data-slot="table-container" sx={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
      <Box
        component="table"
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', className)}
        sx={mergeSx({ width: '100%', captionSide: 'bottom', fontSize: '0.875rem' }, sx)}
        {...(props as Record<string, unknown>)}
      />
    </Box>
  )
}

function TableHeader({ className, sx, ...props }: React.ComponentProps<'thead'> & { sx?: SxProps<Theme> }) {
  return (
    <Box
      component="thead"
      data-slot="table-header"
      className={cn('[&_tr]:border-b', className)}
      sx={mergeSx({ '& tr': { borderBottom: '1px solid', borderColor: 'divider' } }, sx)}
      {...(props as Record<string, unknown>)}
    />
  )
}

function TableBody({ className, sx, ...props }: React.ComponentProps<'tbody'> & { sx?: SxProps<Theme> }) {
  return (
    <Box
      component="tbody"
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      sx={mergeSx({ '& tr:last-child': { borderBottom: 0 } }, sx)}
      {...(props as Record<string, unknown>)}
    />
  )
}

function TableFooter({ className, sx, ...props }: React.ComponentProps<'tfoot'> & { sx?: SxProps<Theme> }) {
  return (
    <Box
      component="tfoot"
      data-slot="table-footer"
      className={cn('border-t font-medium [&>tr]:last:border-b-0', className)}
      sx={mergeSx(
        { borderTop: '1px solid', borderColor: 'divider', bgcolor: 'action.hover', fontWeight: 500, '& tr:last-child': { borderBottom: 0 } },
        sx,
      )}
      {...(props as Record<string, unknown>)}
    />
  )
}

function TableRow({ className, sx, ...props }: React.ComponentProps<'tr'> & { sx?: SxProps<Theme> }) {
  return (
    <Box
      component="tr"
      data-slot="table-row"
      className={cn('transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)}
      sx={mergeSx(
        {
          borderBottom: '1px solid',
          borderColor: 'divider',
          transition: 'background-color 0.2s',
          '&:hover': { bgcolor: 'action.hover' },
          '&[data-state="selected"]': { bgcolor: 'action.selected' },
        },
        sx,
      )}
      {...(props as Record<string, unknown>)}
    />
  )
}

function TableHead({ className, sx, ...props }: React.ComponentProps<'th'> & { sx?: SxProps<Theme> }) {
  return (
    <Box
      component="th"
      data-slot="table-head"
      className={cn('h-10 px-2 text-left align-middle font-medium', className)}
      sx={mergeSx({ height: 40, px: 2, textAlign: 'left', verticalAlign: 'middle', fontWeight: 500, color: 'text.primary' }, sx)}
      {...(props as Record<string, unknown>)}
    />
  )
}

function TableCell({ className, sx, ...props }: React.ComponentProps<'td'> & { sx?: SxProps<Theme> }) {
  return (
    <Box
      component="td"
      data-slot="table-cell"
      className={cn('p-2 align-middle', className)}
      sx={mergeSx({ p: 2, verticalAlign: 'middle' }, sx)}
      {...(props as Record<string, unknown>)}
    />
  )
}

function TableCaption({ className, sx, ...props }: React.ComponentProps<'caption'> & { sx?: SxProps<Theme> }) {
  return (
    <Box
      component="caption"
      data-slot="table-caption"
      className={cn('mt-4 text-sm', className)}
      sx={mergeSx({ mt: 4, fontSize: '0.875rem', color: 'text.secondary' }, sx)}
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
