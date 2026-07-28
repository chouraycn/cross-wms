import * as React from 'react'
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from 'lucide-react'

import Box from '@mui/material/Box'
import type { SxProps, Theme } from '@mui/material/styles'

const SR_ONLY: SxProps<Theme> = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
}

function Pagination({ className, ...props }: Omit<React.ComponentProps<'nav'>, 'ref'>) {
  return (
    <Box
      component="nav"
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={className}
      sx={{ mx: 'auto', display: 'flex', width: '100%', justifyContent: 'center' }}
      {...props}
    />
  )
}

function PaginationContent({ className, ...props }: Omit<React.ComponentProps<'ul'>, 'ref'>) {
  return (
    <Box
      component="ul"
      data-slot="pagination-content"
      className={className}
      sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '4px' }}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: Omit<React.ComponentProps<'li'>, 'ref'>) {
  return <Box component="li" data-slot="pagination-item" {...props} />
}

const PAGE_LINK_SX = (isActive: boolean, size: 'icon' | 'default'): SxProps<Theme> => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
  borderRadius: '8px',
  border: isActive ? '1px solid' : '1px solid transparent',
  borderColor: isActive ? 'divider' : 'transparent',
  bgcolor: isActive ? 'background.paper' : 'transparent',
  color: 'text.primary',
  fontSize: '14px',
  fontWeight: 500,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  transition: 'background-color 0.15s, color 0.15s',
  '&:hover': { bgcolor: 'action.hover' },
  '& svg': { width: '16px', height: '16px' },
  '&:disabled': { pointerEvents: 'none', opacity: 0.5 },
  ...(size === 'default'
    ? { height: '32px', gap: '6px', px: '10px' }
    : { width: '32px', height: '32px', p: 0 }),
})

type PaginationLinkProps = {
  isActive?: boolean
  size?: 'icon' | 'default'
} & Omit<React.ComponentProps<'a'>, 'ref'> & { sx?: SxProps<Theme> }

function PaginationLink({ className, isActive, size = 'icon', sx, ...props }: PaginationLinkProps) {
  return (
    <Box
      component="a"
      aria-current={isActive ? 'page' : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={className}
      sx={{ ...PAGE_LINK_SX(!!isActive, size === 'default' ? 'default' : 'icon'), ...(sx as object) }}
      {...props}
    />
  )
}

function PaginationPrevious({ className, sx, ...props }: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      className={className}
      sx={{ gap: '4px', px: '10px', '@media (min-width: 640px)': { pl: '10px' }, ...(sx as object) }}
      {...props}
    >
      <ChevronLeftIcon />
      <Box
        component="span"
        sx={{ display: 'none', '@media (min-width: 640px)': { display: 'block' } }}
      >
        Previous
      </Box>
    </PaginationLink>
  )
}

function PaginationNext({ className, sx, ...props }: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      className={className}
      sx={{ gap: '4px', px: '10px', '@media (min-width: 640px)': { pr: '10px' }, ...(sx as object) }}
      {...props}
    >
      <Box
        component="span"
        sx={{ display: 'none', '@media (min-width: 640px)': { display: 'block' } }}
      >
        Next
      </Box>
      <ChevronRightIcon />
    </PaginationLink>
  )
}

function PaginationEllipsis({ className, ...props }: Omit<React.ComponentProps<'span'>, 'ref'>) {
  return (
    <Box
      component="span"
      aria-hidden
      data-slot="pagination-ellipsis"
      className={className}
      sx={{ display: 'flex', width: '36px', height: '36px', alignItems: 'center', justifyContent: 'center' }}
      {...props}
    >
      <Box component="span" sx={{ '& svg': { width: '16px', height: '16px' } }}>
        <MoreHorizontalIcon />
      </Box>
      <Box component="span" sx={SR_ONLY}>
        More pages
      </Box>
    </Box>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
}
