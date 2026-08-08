import { RefreshCw } from 'lucide-react';
import Box from '@mui/material/Box';
import { useEffect, useMemo, useState } from 'react';
import {
  Button as UIButton,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  notify,
} from '../../components/staff/ui/index.js';
import { DataTable, type DataTableColumn } from '../../components/staff/DataTable.js';
import { Paginator } from '../../components/staff/Paginator.js';
import { api, TENANT_ID } from '../../components/staff/api/client.js';
import type { TraceSummary } from '../../components/staff/types/index.js';

const TRACES_PAGE_SIZE = 10;

const truncateCellSx = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export default function TracesPage() {
  const [rows, setRows] = useState<TraceSummary[]>([]);
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [page, setPage] = useState(1);

  const load = () =>
    api
      .get<TraceSummary[]>(`/traces?tenant_id=${TENANT_ID}`)
      .then(setRows)
      .catch((error) => notify.error(error.message));

  useEffect(() => {
    void load();
  }, []);

  const pageCount = Math.max(1, Math.ceil(rows.length / TRACES_PAGE_SIZE));
  const pagedItems = useMemo(
    () => rows.slice((page - 1) * TRACES_PAGE_SIZE, page * TRACES_PAGE_SIZE),
    [rows, page],
  );

  async function openDetail(row: TraceSummary) {
    const result = await api.get<Record<string, any>>(`/traces/${row.session_id}?tenant_id=${TENANT_ID}`);
    setDetail(result);
  }

  const columns: DataTableColumn<TraceSummary>[] = [
    { key: 'session_id', title: '会话 ID', width: 230, render: (row) => <Box component="span" sx={truncateCellSx}>{row.session_id}</Box> },
    { key: 'user_id', title: '用户 ID', width: 150, render: (row) => <Box component="span" sx={truncateCellSx}>{row.user_id || '-'}</Box> },
    { key: 'active_skill_id', title: '当前技能', width: 190, render: (row) => <Box component="span" sx={truncateCellSx}>{row.active_skill_id || '-'}</Box> },
    { key: 'active_step_id', title: '当前 Step', width: 190, render: (row) => <Box component="span" sx={truncateCellSx}>{row.active_step_id || '-'}</Box> },
    { key: 'tool_call_count', title: '工具调用', width: 96, render: (row) => row.tool_call_count },
    { key: 'status', title: '状态', width: 96, render: (row) => row.status },
    { key: 'updated_at', title: '更新时间', width: 210, render: (row) => <Box component="span" sx={truncateCellSx}>{row.updated_at}</Box> },
    {
      key: 'actions',
      title: '操作',
      width: 96,
      render: (row) => (
        <UIButton
          variant="outline"
          size="sm"
          sx={{ height: '28px', borderRadius: '8px', px: '12px', fontSize: '12px' }}
          onClick={() => void openDetail(row)}
        >
          查看
        </UIButton>
      ),
    },
  ];

  return (
    <>
      <div className="page-title">
        <h3>Trace</h3>
        <UIButton variant="outline" onClick={() => void load()}>
          <RefreshCw />
          刷新
        </UIButton>
      </div>
      <Card className="data-card">
        <CardHeader>
          <CardTitle>会话 Trace</CardTitle>
        </CardHeader>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Box sx={{ minWidth: '1308px' }}>
              <DataTable
                aria-label="会话 Trace"
                columns={columns}
                data={pagedItems}
                rowKey={(row) => row.session_id}
                emptyText="暂无 Trace"
              />
            </Box>
          </Box>
          {rows.length > 0 && (
            <Box sx={{ '& > *': { mt: 0 } }}>
              <Paginator
                aria-label="Trace 分页"
                page={page}
                pageCount={pageCount}
                onChange={setPage}
              />
            </Box>
          )}
        </CardContent>
      </Card>
      <Sheet open={Boolean(detail)} onOpenChange={(next) => { if (!next) setDetail(null); }}>
        <SheetContent side="right" sx={{ width: '720px', '@media (min-width: 600px)': { maxWidth: '720px' } }}>
          <SheetHeader>
            <SheetTitle>Trace Detail</SheetTitle>
          </SheetHeader>
          <Box sx={{ minHeight: 0, flex: 1, overflowY: 'auto', px: '16px', pb: '16px' }}>
            <Box component="pre" sx={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>{JSON.stringify(detail, null, 2)}</Box>
          </Box>
        </SheetContent>
      </Sheet>
    </>
  );
}
