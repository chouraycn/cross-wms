import type { ReactNode } from 'react';

import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/index.js';

export type DataTableColumn<T> = {
  /** Unique column key. */
  key: string;
  /** Header cell content. */
  title: ReactNode;
  /** Cell renderer. Falls back to `row[dataIndex]` when omitted. */
  render?: (row: T, index: number) => ReactNode;
  /** Shortcut for reading a plain field value when no `render` is provided. */
  dataIndex?: keyof T;
  /** Fixed column width (px number or any CSS width). */
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  /** Extra classes for the body cell. */
  className?: string;
  /** Extra classes for the header cell. */
  headClassName?: string;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string | number;
  loading?: boolean;
  emptyText?: ReactNode;
  loadingText?: ReactNode;
  onRowClick?: (row: T, index: number) => void;
  /** Body row height. `default` = 64px, `compact` = 46px. */
  size?: 'default' | 'compact';
  /** Zebra striping: even rows get a subtle `#fbfbfb` fill. */
  striped?: boolean;
  /** Full grid: every cell is bordered instead of row-only dividers. */
  bordered?: boolean;
  /** Extra classes for the outer rounded container. */
  className?: string;
  'aria-label'?: string;
};

const ALIGN_SX: Record<'left' | 'center' | 'right', SxProps<Theme>> = {
  left: { textAlign: 'left' },
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
};

const HEAD_CELL_SX: SxProps<Theme> = {
  height: '36px',
  bgcolor: '#f2f3f7',
  px: '16px',
  py: '12px',
  verticalAlign: 'middle',
  fontSize: '12px',
  fontWeight: 400,
  color: '#464c5e',
  textAlign: 'left',
};

const BODY_CELL_SX: SxProps<Theme> = {
  px: '16px',
  py: '12px',
  verticalAlign: 'middle',
  fontSize: '12px',
  color: '#858b9c',
};

const CELL_BORDER_SX: SxProps<Theme> = {
  border: '1px solid',
  borderColor: '#f2f3f7',
};

const BODY_HEIGHT_SX: Record<'default' | 'compact', SxProps<Theme>> = {
  default: { minHeight: '64px' },
  compact: { minHeight: '46px' },
};

/**
 * Business data table: rounded `#f2f3f7` frame, gray header row, white body
 * rows with hairline dividers. Built on top of the shadcn `Table` primitives
 * but owns the product-specific styling (moved to `sx`).
 */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  emptyText = '暂无数据',
  loadingText = '加载中…',
  onRowClick,
  size = 'default',
  striped = false,
  bordered = false,
  className,
  'aria-label': ariaLabel,
}: DataTableProps<T>) {
  const hasData = data.length > 0;
  return (
    <Box
      sx={{ overflow: 'hidden', borderRadius: '14px', border: '1px solid', borderColor: '#f2f3f7' }}
      className={className}
    >
      <Table
        sx={{ width: '100%', tableLayout: 'fixed', fontSize: '12px' } as SxProps<Theme>}
        aria-label={ariaLabel}
      >
        <TableHeader>
          <TableRow sx={{ border: 'none', '&:hover': { bgcolor: 'transparent' } } as SxProps<Theme>}>
            {columns.map((column) => (
              <TableHead
                key={column.key}
                style={column.width ? { width: column.width } : undefined}
                sx={
                  [
                    HEAD_CELL_SX,
                    bordered && CELL_BORDER_SX,
                    ALIGN_SX[column.align ?? 'left'],
                  ].filter(Boolean) as SxProps<Theme>[]
                }
                className={column.headClassName}
              >
                {column.title}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {hasData ? (
            data.map((row, index) => (
              <TableRow
                key={rowKey(row, index)}
                onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                sx={
                  {
                    cursor: onRowClick ? 'pointer' : undefined,
                    borderBottom: bordered ? 'none' : '1px solid #f2f3f7',
                    '&:last-child': { borderBottom: 'none' },
                    '&:has([aria-expanded])': { bgcolor: 'transparent' },
                    ...(striped
                      ? index % 2 === 1
                        ? { bgcolor: '#fbfbff', '&:hover': { bgcolor: '#f2f3f7' } }
                        : { bgcolor: '#fff', '&:hover': { bgcolor: '#f2f3f7' } }
                      : { '&:hover': { bgcolor: '#fafbfc' } }),
                  } as SxProps<Theme>
                }
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    sx={
                      [
                        BODY_CELL_SX,
                        BODY_HEIGHT_SX[size],
                        bordered && CELL_BORDER_SX,
                        ALIGN_SX[column.align ?? 'left'],
                      ].filter(Boolean) as SxProps<Theme>[]
                    }
                    className={column.className}
                  >
                    {column.render
                      ? column.render(row, index)
                      : column.dataIndex != null
                        ? (row[column.dataIndex] as ReactNode)
                        : null}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow sx={{ '&:hover': { bgcolor: 'transparent' } } as SxProps<Theme>}>
              <TableCell
                colSpan={columns.length}
                sx={
                  {
                    height: '160px',
                    textAlign: 'center',
                    verticalAlign: 'middle',
                    fontSize: '13px',
                    color: '#858b9c',
                  } as SxProps<Theme>
                }
              >
                {loading ? loadingText : emptyText}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Box>
  );
}

export default DataTable;
