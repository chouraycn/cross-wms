import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { Pagination, PaginationContent, PaginationItem } from './ui/index.js';

export type PaginatorProps = {
  /** Current 1-based page. */
  page: number;
  /** Total number of pages. */
  pageCount: number;
  onChange: (page: number) => void;
  /** How many page numbers to show on each side of the current page. */
  siblingCount?: number;
  /** Zero-pad page numbers (01, 02, …) to match the SD1 design. Defaults to true. */
  padZero?: boolean;
  className?: string;
  'aria-label'?: string;
};

const ARROW_SX: SxProps<Theme> = {
  display: 'flex',
  width: '14px',
  height: '14px',
  flexShrink: 0,
  alignItems: 'center',
  justifyContent: 'center',
  color: '#464c5c',
  transition: 'opacity 0.2s',
  '&:disabled': { cursor: 'not-allowed', opacity: 0.3 },
};

const ELLIPSIS_SX: SxProps<Theme> = {
  display: 'flex',
  height: '20px',
  alignItems: 'center',
  justifyContent: 'center',
  px: '4px',
  fontSize: '10px',
  lineHeight: 'none',
  color: '#999',
};

function getPaginationRange(
  current: number,
  total: number,
  siblingCount: number,
): (number | 'ellipsis')[] {
  const totalNumbers = siblingCount * 2 + 5;
  if (total <= totalNumbers) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const items: (number | 'ellipsis')[] = [1];
  const start = Math.max(2, current - siblingCount);
  const end = Math.min(total - 1, current + siblingCount);
  if (start > 2) items.push('ellipsis');
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < total - 1) items.push('ellipsis');
  items.push(total);
  return items;
}

/**
 * Paginator: 20px pills, 10px zero-padded numbers, `#f6f6f6` active fill,
 * `#999` inactive text, and 14px chevron arrows.
 */
export function Paginator({
  page,
  pageCount,
  onChange,
  siblingCount = 1,
  padZero = true,
  className,
  'aria-label': ariaLabel,
}: PaginatorProps) {
  if (pageCount < 1) return null;
  const range = getPaginationRange(page, pageCount, siblingCount);
  const label = (value: number) => (padZero ? String(value).padStart(2, '0') : String(value));
  const goTo = (target: number) => {
    const next = Math.min(Math.max(target, 1), pageCount);
    if (next !== page) onChange(next);
  };
  return (
    <Box sx={{ mt: '16px' }} className={className}>
      <Pagination aria-label={ariaLabel}>
        <PaginationContent sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '16px' }}>
          <PaginationItem>
            <Box
              component="button"
              type="button"
              sx={ARROW_SX}
              disabled={page <= 1}
              onClick={() => goTo(page - 1)}
              aria-label="上一页"
            >
              <ChevronLeftIcon size={14} />
            </Box>
          </PaginationItem>
          {range.map((item, index) =>
            item === 'ellipsis' ? (
              <PaginationItem key={`ellipsis-${index}`}>
                <Box component="span" aria-hidden="true" sx={ELLIPSIS_SX}>
                  ···
                </Box>
              </PaginationItem>
            ) : (
              <PaginationItem key={item}>
                <Box
                  component="button"
                  type="button"
                  aria-current={item === page ? 'page' : undefined}
                  onClick={() => goTo(item)}
                  sx={[
                    {
                      display: 'flex',
                      height: '20px',
                      minWidth: '20px',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '6px',
                      px: '12px',
                      fontSize: '10px',
                      lineHeight: 'none',
                      transition: 'background-color 0.2s',
                    },
                    item === page
                      ? { bgcolor: '#f6f6f6', color: '#464c5e' }
                      : { color: '#999', '&:hover': { bgcolor: '#f2f3f7', color: '#464c5e' } },
                  ] as SxProps<Theme>}
                >
                  {label(item)}
                </Box>
              </PaginationItem>
            ),
          )}
          <PaginationItem>
            <Box
              component="button"
              type="button"
              sx={ARROW_SX}
              disabled={page >= pageCount}
              onClick={() => goTo(page + 1)}
              aria-label="下一页"
            >
              <ChevronRightIcon size={14} />
            </Box>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </Box>
  );
}

export default Paginator;
