/**
 * 客商管理页面
 *
 * 供应商 & 客户统一管理，支持筛选、搜索、分页、增删改查。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  Button,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { getPartners, deletePartner } from '../services/api';
import PartnerDialog from '../components/Partners/PartnerDialog';
import PageHeader from '../components/Common/PageHeader';
import SearchInput from '../components/Common/SearchInput';
import { useToast } from '../contexts/ToastContext';
import type { Partner, PartnerType } from '../types/partners';

const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  supplier: '供应商',
  customer: '客户',
};

const PARTNER_TYPE_COLORS: Record<PartnerType, 'primary' | 'success'> = {
  supplier: 'primary',
  customer: 'success',
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const PartnersPage: React.FC = () => {
  const { showToast } = useToast();

  // 列表数据
  const [items, setItems] = useState<Partner[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // 筛选
  const [filterType, setFilterType] = useState<PartnerType | 'all'>('all');
  const [searchText, setSearchText] = useState('');

  // 分页
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // 弹窗
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | undefined>(undefined);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<Partner | null>(null);
  const [deleting, setDeleting] = useState(false);

  /** 拉取列表 */
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: { type?: PartnerType; search?: string; page?: number; pageSize?: number } = {
        page: page + 1,
        pageSize: rowsPerPage,
      };
      if (filterType !== 'all') params.type = filterType;
      if (searchText.trim()) params.search = searchText.trim();

      const result = await getPartners(params);
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载客商列表失败';
      showToast(message, 'error');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, filterType, searchText, showToast]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  /** 切换筛选 tab 时重置页码 */
  const handleTypeChange = (_: React.SyntheticEvent, value: PartnerType | 'all') => {
    setFilterType(value);
    setPage(0);
  };

  /** 搜索时重置页码 */
  const handleSearchChange = (value: string) => {
    setSearchText(value);
    setPage(0);
  };

  /** 打开新增弹窗 */
  const handleAdd = () => {
    setEditingPartner(undefined);
    setDialogOpen(true);
  };

  /** 打开编辑弹窗 */
  const handleEdit = (partner: Partner) => {
    setEditingPartner(partner);
    setDialogOpen(true);
  };

  /** 新增/编辑成功回调 */
  const handleDialogSuccess = () => {
    setDialogOpen(false);
    setEditingPartner(undefined);
    fetchList();
  };

  /** 关闭弹窗 */
  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingPartner(undefined);
  };

  /** 执行删除 */
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePartner(deleteTarget.id);
      showToast(`已删除客商「${deleteTarget.name}」`, 'success');
      setDeleteTarget(null);
      fetchList();
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除失败';
      showToast(message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  /** 格式化时间 */
  const formatTime = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return dateStr;
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return dateStr;
    }
  };

  const summary = total > 0 ? `共 ${total} 个客商` : undefined;

  return (
    <Box className="page-fade-in">
      <PageHeader
        title="客商管理"
        summary={summary}
        action={
          <Button
            variant="contained"
            startIcon={<AddOutlinedIcon sx={{ fontSize: 16 }} />}
            onClick={handleAdd}
            sx={{
              textTransform: 'none',
              borderRadius: '8px',
              fontSize: '0.8125rem',
              backgroundColor: '#111827',
              '&:hover': { backgroundColor: '#374151' },
            }}
          >
            新增客商
          </Button>
        }
      />

      {/* 筛选栏 */}
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1 }}>
          <Tabs
            value={filterType}
            onChange={handleTypeChange}
            sx={{
              minHeight: 36,
              '& .MuiTab-root': {
                minHeight: 36,
                textTransform: 'none',
                fontSize: '0.8125rem',
                fontWeight: 500,
                px: 2,
              },
            }}
          >
            <Tab label="全部" value="all" />
            <Tab label="供应商" value="supplier" />
            <Tab label="客户" value="customer" />
          </Tabs>
          <Box sx={{ ml: 'auto' }}>
            <SearchInput
              value={searchText}
              onChange={handleSearchChange}
              placeholder="搜索客商名称..."
              width={220}
            />
          </Box>
        </Box>
      </Card>

      {/* 数据表格 */}
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: '#FAFAFA' }}>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>名称</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>类型</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>联系人</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>电话</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>地址</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>创建时间</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', width: 100 }}>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!loading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    <Typography variant="body2" color="text.secondary">
                      {searchText.trim() || filterType !== 'all'
                        ? '没有匹配的客商记录'
                        : '暂无客商，点击「新增客商」开始添加'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {items.map((partner) => (
                <TableRow key={partner.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#111827' }}>
                      {partner.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={PARTNER_TYPE_LABELS[partner.type]}
                      size="small"
                      color={PARTNER_TYPE_COLORS[partner.type]}
                      variant="outlined"
                      sx={{ fontSize: '0.7rem', height: 22 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {partner.contact || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                      {partner.phone || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: '0.8rem',
                        color: 'text.secondary',
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {partner.address || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                      {formatTime(partner.created_at)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="编辑">
                        <IconButton
                          size="small"
                          onClick={() => handleEdit(partner)}
                          sx={{ color: '#6B7280', '&:hover': { color: '#111827' } }}
                        >
                          <EditOutlinedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="删除">
                        <IconButton
                          size="small"
                          onClick={() => setDeleteTarget(partner)}
                          sx={{ color: '#9CA3AF', '&:hover': { color: '#EF4444' } }}
                        >
                          <DeleteOutlineOutlinedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={PAGE_SIZE_OPTIONS}
          labelRowsPerPage="每页行数："
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} / 共 ${count} 条`}
        />
      </Card>

      {/* 新增/编辑弹窗 */}
      <PartnerDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        onSuccess={handleDialogSuccess}
        partner={editingPartner}
      />

      {/* 删除确认弹窗 */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
          },
        }}
        BackdropProps={{
          sx: { backgroundColor: 'rgba(0,0,0,0.3)' },
        }}
      >
        <DialogTitle sx={{ fontWeight: 600, px: 3, py: 2, borderBottom: '1px solid #E5E7EB' }}>
          确认删除
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <Typography sx={{ color: '#6B7280' }}>
            确定要删除客商「{deleteTarget?.name}」吗？此操作不可撤销。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 2, borderTop: '1px solid #E5E7EB' }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleDeleteConfirm}
            disabled={deleting}
            sx={{
              backgroundColor: '#EF4444',
              '&:hover': { backgroundColor: '#DC2626' },
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            {deleting ? '删除中...' : '确认删除'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PartnersPage;
