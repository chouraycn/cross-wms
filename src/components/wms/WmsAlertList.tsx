/**
 * 异常预警列表组件
 *
 * 展示预警列表，支持解决/忽略操作。
 * 预警类型和严重程度使用带颜色的 Chip 展示。
 */

import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Typography,
  TablePagination,
  Tooltip,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import type { WmsAlert, AlertType, AlertSeverity } from '../../types/wms';

/** 预警类型 → Chip 颜色映射 */
const ALERT_TYPE_COLORS: Record<AlertType, 'warning' | 'error' | 'secondary'> = {
  low_stock: 'warning',
  expiry: 'error',
  stagnant: 'secondary',
};

const ALERT_TYPE_COLORS_HEX: Record<AlertType, string> = {
  low_stock: '#EA580C',
  expiry: '#DC2626',
  stagnant: '#CA8A04',
};

/** 预警类型 → 中文标签 */
const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  low_stock: '低库存',
  expiry: '临期',
  stagnant: '滞销',
};

/** 严重程度 → Chip 颜色映射 */
const SEVERITY_COLORS: Record<AlertSeverity, 'info' | 'warning' | 'error' | 'secondary'> = {
  low: 'info',
  medium: 'warning',
  high: 'error',
  critical: 'secondary',
};

const SEVERITY_COLORS_HEX: Record<AlertSeverity, string> = {
  low: '#2563EB',
  medium: '#EA580C',
  high: '#DC2626',
  critical: '#7C3AED',
};

/** 严重程度 → 中文标签 */
const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '紧急',
};

/** 状态 → 中文标签 */
const STATUS_LABELS: Record<string, string> = {
  active: '活跃',
  resolved: '已解决',
  ignored: '已忽略',
};

export interface WmsAlertListProps {
  alerts: WmsAlert[];
  loading: boolean;
  onResolve: (alertId: number) => void;
  onIgnore: (alertId: number) => void;
}

const WmsAlertList: React.FC<WmsAlertListProps> = ({ alerts, loading, onResolve, onIgnore }) => {
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(20);

  const activeCount = alerts.filter((a) => a.status === 'active').length;

  const paginatedAlerts = alerts.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Box>
      {/* 统计概要 */}
      {activeCount > 0 && (
        <Card
          elevation={0}
          sx={{
            border: '1px solid #FCA5A5',
            borderRadius: 2,
            mb: 2,
            backgroundColor: '#FEF2F2',
          }}
        >
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <NotificationsActiveIcon sx={{ color: '#DC2626', fontSize: 20 }} />
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#991B1B' }}>
                当前 {activeCount} 条活跃预警
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* 预警表格 */}
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">正在加载预警数据...</Typography>
          </Box>
        ) : alerts.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">暂无预警数据</Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>ID</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>仓库ID</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>预警类型</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>严重程度</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>SKU</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>消息</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>触发时间</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>状态</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', width: 120 }}>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedAlerts.map((alert) => (
                    <TableRow
                      key={alert.id}
                      sx={{
                        '&:last-child td': { borderBottom: 0 },
                        backgroundColor: alert.status === 'active' ? '#FFFBEB' : 'transparent',
                      }}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {alert.id}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                          {alert.warehouseId}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={ALERT_TYPE_LABELS[alert.alertType] || alert.alertType}
                          size="small"
                          sx={{
                            fontSize: '0.7rem',
                            height: 22,
                            backgroundColor: ALERT_TYPE_COLORS_HEX[alert.alertType],
                            color: '#FFFFFF',
                            fontWeight: 600,
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={SEVERITY_LABELS[alert.severity] || alert.severity}
                          size="small"
                          sx={{
                            fontSize: '0.7rem',
                            height: 22,
                            backgroundColor: SEVERITY_COLORS_HEX[alert.severity],
                            color: '#FFFFFF',
                            fontWeight: 600,
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                          {alert.sku || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {alert.message}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
                          {formatDate(alert.triggeredAt)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={STATUS_LABELS[alert.status] || alert.status}
                          size="small"
                          color={
                            alert.status === 'active' ? 'error'
                            : alert.status === 'resolved' ? 'success'
                            : 'default'
                          }
                          variant={alert.status === 'ignored' ? 'outlined' : 'filled'}
                          sx={{ fontSize: '0.65rem', height: 20 }}
                        />
                      </TableCell>
                      <TableCell>
                        {alert.status === 'active' && (
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Tooltip title="标记已解决">
                              <IconButton
                                size="small"
                                onClick={() => alert.id !== undefined && onResolve(alert.id)}
                                sx={{ color: '#059669' }}
                              >
                                <CheckCircleOutlineIcon sx={{ fontSize: 18 }} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="忽略">
                              <IconButton
                                size="small"
                                onClick={() => alert.id !== undefined && onIgnore(alert.id)}
                                sx={{ color: '#9CA3AF' }}
                              >
                                <RemoveCircleOutlineIcon sx={{ fontSize: 18 }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={alerts.length}
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

export default WmsAlertList;
