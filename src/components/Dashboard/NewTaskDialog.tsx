/**
 * 新建任务对话框 — WorkBuddy 风格
 * 上方显示相关信息（当前仓库/KPI 概览），下方是任务表单
 * 圆角 12px + 柔和阴影，极简黑白灰
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  Chip,
  Paper,
  Stack,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddTaskIcon from '@mui/icons-material/AddTask';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import InventoryIcon from '@mui/icons-material/Inventory';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import FlagIcon from '@mui/icons-material/Flag';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { ALL_WAREHOUSES } from './WarehouseSelector';
import type { Warehouse, TransitOrder, InventoryItem } from '../../types';
import { mockTransitOrders, mockInventory, mockWarehouses } from '../../data/mockData';
import dayjs from 'dayjs';

// ==================== 任务类型 ====================

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskCategory = 'inbound' | 'outbound' | 'inventory' | 'transit' | 'general';

export interface TaskFormData {
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  dueDate: string;
  warehouseId: string;
}

interface NewTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (task: TaskFormData) => void;
  /** 当前选中的仓库 ID（用于上方信息区） */
  selectedWarehouse: string;
  /** 仓库列表 */
  warehouses: Warehouse[];
}

// ==================== 优先级配置 ====================

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  low:       { label: '低', color: '#059669', bg: '#ECFDF5' },
  medium:    { label: '中', color: '#D97706', bg: '#FFFBEB' },
  high:      { label: '高', color: '#DC2626', bg: '#FEF2F2' },
  urgent:    { label: '紧急', color: '#FFFFFF', bg: '#DC2626' },
};

const CATEGORY_OPTIONS: { value: TaskCategory; label: string }[] = [
  { value: 'inbound',  label: '入库任务' },
  { value: 'outbound', label: '出库任务' },
  { value: 'inventory', label: '库存管理' },
  { value: 'transit', label: '在途管理' },
  { value: 'general', label: '通用任务' },
];

// ==================== 主组件 ====================

const NewTaskDialog: React.FC<NewTaskDialogProps> = ({
  open,
  onClose,
  onSubmit,
  selectedWarehouse,
  warehouses,
}) => {
  const { settings } = useAppSettings();

  // 表单状态
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory>('general');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [warehouseId, setWarehouseId] = useState(selectedWarehouse || ALL_WAREHOUSES);

  // 打开时重置表单
  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setCategory('general');
      setPriority('medium');
      // 默认截止日期：3 天后
      setDueDate(dayjs().add(3, 'day').format('YYYY-MM-DD'));
      setWarehouseId(selectedWarehouse || ALL_WAREHOUSES);
    }
  }, [open, selectedWarehouse]);

  // ========== 上方信息区数据 ==========

  const infoData = useMemo(() => {
    const targetWarehouses = selectedWarehouse === ALL_WAREHOUSES
      ? warehouses
      : warehouses.filter(w => w.id === selectedWarehouse);

    // 总库存深度
    const totalInventory = selectedWarehouse === ALL_WAREHOUSES
      ? mockInventory.length
      : mockInventory.filter(i => i.warehouseId === selectedWarehouse).length;

    // 在途运单数
    const transitOrders = selectedWarehouse === ALL_WAREHOUSES
      ? mockTransitOrders.filter(t => t.status !== 'arrived')
      : mockTransitOrders.filter(t => t.toWarehouseId === selectedWarehouse && t.status !== 'arrived');

    // 平均容积率
    let avgRate = 0;
    if (targetWarehouses.length > 0) {
      const rates = targetWarehouses.map(wh => {
        const total = wh.totalItems || wh.totalVolume;
        const used = wh.usedItems || wh.usedVolume;
        return total > 0 ? (used / total) * 100 : 0;
      });
      avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
    }

    return {
      warehouseLabel: selectedWarehouse === ALL_WAREHOUSES
        ? `全部仓库 (${warehouses.length})`
        : targetWarehouses[0]?.name || '未知仓库',
      totalInventory,
      transitCount: transitOrders.length,
      avgVolumeRate: avgRate.toFixed(1),
      warningCount: settings.dashboard.visibility.chartInventoryAlert
        ? mockInventory.filter(i => {
            const age = dayjs().diff(dayjs(i.inboundDate), 'day');
            const matchesWarehouse = selectedWarehouse === ALL_WAREHOUSES || i.warehouseId === selectedWarehouse;
            return matchesWarehouse && (i.isAgeWarning || age >= settings.dashboard.ageWarningDays);
          }).length
        : 0,
    };
  }, [warehouses, selectedWarehouse, settings.dashboard]);

  // ========== 提交 ==========

  const handleSubmit = useCallback(() => {
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      category,
      priority,
      dueDate,
      warehouseId,
    });
  }, [title, description, category, priority, dueDate, warehouseId, onSubmit]);

  const isFormValid = title.trim().length > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
          overflow: 'hidden',
          m: 0,
        },
      }}
      BackdropProps={{
        sx: { backgroundColor: 'rgba(0,0,0,0.3)' },
      }}
    >
      {/* ===== 标题栏 ===== */}
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          py: 2,
          borderBottom: '1px solid #E5E7EB',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AddTaskIcon sx={{ fontSize: 22, color: '#111827' }} />
          <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
            新建任务
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: '#9CA3AF' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      {/* ===== 上方信息区 — WorkBuddy 风格 ===== */}
      <Box
        sx={{
          px: 3,
          py: 2,
          backgroundColor: '#F9FAFB',
          borderBottom: '1px solid #E5E7EB',
        }}
      >
        <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, color: '#9CA3AF', mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          当前上下文
        </Typography>

        {/* 仓库信息 + KPI 概览 */}
        <Stack spacing={1.5}>
          {/* 仓库名称 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WarehouseOutlinedIcon sx={{ fontSize: 16, color: '#6B7280' }} />
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, color: '#374151' }}>
              {infoData.warehouseLabel}
            </Typography>
          </Box>

          {/* KPI 指标行 */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Chip
              icon={<InventoryIcon sx={{ fontSize: 14, color: '#6B7280 !important' }} />}
              label={`库存 ${infoData.totalInventory} SKU`}
              size="small"
              sx={{ fontSize: '0.6875rem', height: 24, backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB' }}
            />
            <Chip
              icon={<LocalShippingIcon sx={{ fontSize: 14, color: '#6B7280 !important' }} />}
              label={`在途 ${infoData.transitCount} 单`}
              size="small"
              sx={{ fontSize: '0.6875rem', height: 24, backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB' }}
            />
            <Chip
              icon={<TrendingUpIcon sx={{ fontSize: 14, color: '#6B7280 !important' }} />}
              label={`容积率 ${infoData.avgVolumeRate}%`}
              size="small"
              sx={{ fontSize: '0.6875rem', height: 24, backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB' }}
            />
            {infoData.warningCount > 0 && (
              <Chip
                label={`${infoData.warningCount} 个库龄预警`}
                size="small"
                sx={{ fontSize: '0.6875rem', height: 24, backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
              />
            )}
          </Box>
        </Stack>
      </Box>

      {/* ===== 表单区域 ===== */}
      <DialogContent sx={{ px: 3, py: 2.5, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {/* 任务标题 */}
        <TextField
          label="任务标题"
          value={title}
          onChange={e => setTitle(e.target.value)}
          fullWidth
          required
          size="small"
          placeholder="输入任务标题..."
          sx={{
            '& .MuiInputBase-root': { fontSize: '0.875rem' },
            '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
          }}
        />

        {/* 任务描述 */}
        <TextField
          label="描述（可选）"
          value={description}
          onChange={e => setDescription(e.target.value)}
          fullWidth
          multiline
          minRows={2}
          maxRows={4}
          size="small"
          placeholder="添加任务描述..."
          sx={{
            '& .MuiInputBase-root': { fontSize: '0.875rem' },
            '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
          }}
        />

        {/* 分类 + 优先级 */}
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel sx={{ fontSize: '0.8125rem' }}>任务分类</InputLabel>
            <Select
              value={category}
              label="任务分类"
              onChange={e => setCategory(e.target.value as TaskCategory)}
              sx={{ fontSize: '0.8125rem' }}
            >
              {CATEGORY_OPTIONS.map(opt => (
                <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.8125rem' }}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel sx={{ fontSize: '0.8125rem' }}>优先级</InputLabel>
            <Select
              value={priority}
              label="优先级"
              onChange={e => setPriority(e.target.value as TaskPriority)}
              sx={{ fontSize: '0.8125rem' }}
            >
              {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                <MenuItem key={key} value={key} sx={{ fontSize: '0.8125rem' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: cfg.color,
                      }}
                    />
                    {cfg.label}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* 截止日期 + 关联仓库 */}
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="截止日期"
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            size="small"
            fullWidth
            InputLabelProps={{ shrink: true }}
            sx={{
              '& .MuiInputBase-root': { fontSize: '0.8125rem' },
              '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
            }}
          />

          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel sx={{ fontSize: '0.8125rem' }}>关联仓库</InputLabel>
            <Select
              value={warehouseId}
              label="关联仓库"
              onChange={e => setWarehouseId(e.target.value)}
              sx={{ fontSize: '0.8125rem' }}
            >
              <MenuItem value={ALL_WAREHOUSES} sx={{ fontSize: '0.8125rem' }}>
                全部仓库
              </MenuItem>
              {warehouses.map(wh => (
                <MenuItem key={wh.id} value={wh.id} sx={{ fontSize: '0.8125rem' }}>
                  {wh.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </DialogContent>

      {/* ===== 操作按钮 ===== */}
      <DialogActions
        sx={{
          px: 3,
          py: 2,
          borderTop: '1px solid #E5E7EB',
          gap: 1,
        }}
      >
        <Button
          onClick={onClose}
          size="small"
          sx={{
            color: '#6B7280',
            fontSize: '0.8125rem',
            textTransform: 'none',
          }}
        >
          取消
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!isFormValid}
          variant="contained"
          size="small"
          startIcon={<AddTaskIcon sx={{ fontSize: 16 }} />}
          sx={{
            backgroundColor: '#111827',
            color: '#FFFFFF',
            fontSize: '0.8125rem',
            textTransform: 'none',
            boxShadow: 'none',
            '&:hover': { backgroundColor: '#374151', boxShadow: 'none' },
            '&.Mui-disabled': { backgroundColor: '#E5E7EB', color: '#9CA3AF' },
          }}
        >
          创建任务
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NewTaskDialog;
