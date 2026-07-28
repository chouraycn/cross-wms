import type { ReactNode } from 'react';
import Box from '@mui/material/Box';

import { DataTable, type DataTableColumn } from '../../../components/staff/DataTable.js';
import { Paginator } from '../../../components/staff/Paginator.js';
import { UnderlineTabs, type UnderlineTabItem } from '../../../components/staff/ui/index.js';

export type TaskSectionProps<TFilter extends string, TRow> = {
  /** Leading header icon (14px). */
  icon: ReactNode;
  title: string;
  filterTabs: UnderlineTabItem<TFilter>[];
  filter: TFilter;
  onFilterChange: (value: TFilter) => void;
  /** All filtered rows — drives the mobile list and paginator visibility. */
  rows: TRow[];
  /** Rows for the current page — drives the desktop table. */
  pagedRows: TRow[];
  columns: DataTableColumn<TRow>[];
  rowKey: (row: TRow, index: number) => string | number;
  loading?: boolean;
  emptyText: string;
  tableSize?: 'default' | 'compact';
  striped?: boolean;
  bordered?: boolean;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Mobile (<768px) card renderer for a single row. */
  renderMobileCard: (row: TRow) => ReactNode;
};

/**
 * 定时任务页的标题列表分区：头部（图标 + 标题）、下划线筛选 Tab、
 * 移动端卡片列表，以及桌面端 DataTable + Paginator。任务列表与执行日志共用。
 */
export function TaskSection<TFilter extends string, TRow>({
  icon,
  title,
  filterTabs,
  filter,
  onFilterChange,
  rows,
  pagedRows,
  columns,
  rowKey,
  loading,
  emptyText,
  tableSize = 'default',
  striped = false,
  bordered = false,
  page,
  pageCount,
  onPageChange,
  renderMobileCard,
}: TaskSectionProps<TFilter, TRow>) {
  return (
    <section aria-label={title}>
      <Box
        sx={{
          mb: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          px: '12px',
          color: '#757f9c',
        }}
      >
        {icon}
        <Box component="span" sx={{ fontSize: '14px', fontWeight: 400, lineHeight: 1 }}>
          {title}
        </Box>
      </Box>
      <Box sx={{ mb: '16px' }}>
        <UnderlineTabs
          aria-label={`${title}筛选`}
          variant="line"
          value={filter}
          onChange={onFilterChange}
          items={filterTabs}
        />
      </Box>
      <Box
        sx={{
          display: 'grid',
          gap: '10px',
          '@media (min-width: 768px)': { display: 'none' },
        }}
      >
        {rows.length ? (
          rows.map(renderMobileCard)
        ) : (
          <Box sx={{ py: '40px', textAlign: 'center', fontSize: '13px', color: '#858b9c' }}>
            {emptyText}
          </Box>
        )}
      </Box>
      <Box
        sx={{
          display: 'none',
          '@media (min-width: 768px)': { display: 'block' },
        }}
      >
        <DataTable
          aria-label={title}
          columns={columns}
          data={pagedRows}
          rowKey={rowKey}
          loading={loading}
          emptyText={emptyText}
          size={tableSize}
          striped={striped}
          bordered={bordered}
        />
        {rows.length > 0 && (
          <Paginator
            aria-label={`${title}分页`}
            page={page}
            pageCount={pageCount}
            onChange={onPageChange}
          />
        )}
      </Box>
    </section>
  );
}
