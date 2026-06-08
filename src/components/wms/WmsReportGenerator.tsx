/**
 * 报表生成器组件
 *
 * 提供报表生成表单 + 历史记录表格。
 * 通过 POST /api/wms/reports/generate 生成报表。
 * 通过 GET /api/wms/reports 获取历史记录。
 */

import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  CircularProgress,
  Chip,
  TablePagination,
  Tooltip,
  IconButton,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import type { WmsReport, ReportType, FileFormat } from '../../types/wms';

/** 报表类型 → 中文标签 */
const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  inbound: '入库报表',
  outbound: '出库报表',
  inventory: '库存报表',
  custom: '自定义报表',
};

/** 报表状态 → 中文标签 */
const REPORT_STATUS_LABELS: Record<string, string> = {
  pending: '生成中',
  completed: '已完成',
  failed: '失败',
};

export interface WmsReportGeneratorProps {
  reports: WmsReport[];
  loading: boolean;
  onGenerate: (params: {
    reportType: ReportType;
    warehouseId?: string;
    startDate?: string;
    endDate?: string;
    fileFormat: FileFormat;
  }) => void;
  onDownload: (report: WmsReport) => void;
}

const WmsReportGenerator: React.FC<WmsReportGeneratorProps> = ({
  reports,
  loading,
  onGenerate,
  onDownload,
}) => {
  const [reportType, setReportType] = useState<ReportType>('inventory');
  const [warehouseId, setWarehouseId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [fileFormat, setFileFormat] = useState<FileFormat>('csv');
  const [generating, setGenerating] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await onGenerate({
        reportType,
        warehouseId: warehouseId.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        fileFormat,
      });
    } finally {
      setGenerating(false);
    }
  };

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('zh-CN');
    } catch {
      return dateStr;
    }
  };

  const paginatedReports = reports.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Box>
      {/* 生成报表表单 */}
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, mb: 3 }}>
        <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2, color: '#111827' }}>
            生成新报表
          </Typography>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>报表类型</InputLabel>
                <Select
                  value={reportType}
                  label="报表类型"
                  onChange={(e) => setReportType(e.target.value as ReportType)}
                >
                  <MenuItem value="inbound">入库报表</MenuItem>
                  <MenuItem value="outbound">出库报表</MenuItem>
                  <MenuItem value="inventory">库存报表</MenuItem>
                  <MenuItem value="custom">自定义报表</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="仓库ID（可选）"
                size="small"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                placeholder="留空表示全部仓库"
                sx={{ minWidth: 200 }}
              />
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>文件格式</InputLabel>
                <Select
                  value={fileFormat}
                  label="文件格式"
                  onChange={(e) => setFileFormat(e.target.value as FileFormat)}
                >
                  <MenuItem value="csv">CSV</MenuItem>
                  <MenuItem value="xlsx">Excel (XLSX)</MenuItem>
                  <MenuItem value="pdf">PDF</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              <TextField
                label="开始日期"
                size="small"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 180 }}
              />
              <TextField
                label="结束日期"
                size="small"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 180 }}
              />
              <Button
                variant="contained"
                onClick={handleGenerate}
                disabled={generating}
                sx={{
                  backgroundColor: '#111827',
                  textTransform: 'none',
                  borderRadius: '8px',
                  minWidth: 120,
                  '&:hover': { backgroundColor: '#374151' },
                }}
              >
                {generating ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={16} color="inherit" />
                    生成中...
                  </Box>
                ) : (
                  '生成报表'
                )}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* 历史记录 */}
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5, color: '#111827' }}>
        历史记录
      </Typography>
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">正在加载报表历史...</Typography>
          </Box>
        ) : reports.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">暂无报表记录</Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>ID</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>报表类型</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>仓库ID</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>开始日期</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>结束日期</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>文件格式</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>生成时间</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>状态</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', width: 80 }}>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedReports.map((report) => (
                    <TableRow
                      key={report.id}
                      sx={{ '&:last-child td': { borderBottom: 0 } }}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {report.id}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={REPORT_TYPE_LABELS[report.reportType] || report.reportType}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.7rem', height: 22 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                          {report.warehouseId || '全部'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {report.startDate || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {report.endDate || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={report.fileFormat.toUpperCase()}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ fontSize: '0.65rem', height: 20 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
                          {formatDate(report.generatedAt)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={REPORT_STATUS_LABELS[report.status] || report.status}
                          size="small"
                          color={
                            report.status === 'completed' ? 'success'
                            : report.status === 'failed' ? 'error'
                            : 'warning'
                          }
                          sx={{ fontSize: '0.65rem', height: 20 }}
                        />
                      </TableCell>
                      <TableCell>
                        {report.status === 'completed' && (
                          <Tooltip title="下载报表">
                            <IconButton
                              size="small"
                              onClick={() => onDownload(report)}
                              sx={{ color: '#2563EB' }}
                            >
                              <FileDownloadIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={reports.length}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[10, 20, 50]}
              labelRowsPerPage="每页行数："
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} / 共 ${count} 条`}
            />
          </>
        )}
      </Card>
    </Box>
  );
};

export default WmsReportGenerator;
