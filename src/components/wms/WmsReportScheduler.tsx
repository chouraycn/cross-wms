/**
 * WmsReportScheduler
 *
 * WMS 报表调度器组件。
 * 支持选择报表类型、仓库、调度频率，创建定时报表生成任务。
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Button,
  Paper,
  Divider,
  Alert,
  CircularProgress,
  Stack,
} from '@mui/material';
import { useToast } from '../../contexts/ToastContext';

// ===================== 类型定义 =====================

type ReportType = 'inventory' | 'inbound' | 'outbound';
type FreqType = 'DAILY' | 'WEEKLY' | 'MONTHLY';

interface Warehouse {
  id: string;
  name: string;
}

interface ReportScheduleConfig {
  reportType: ReportType;
  warehouseId: string;
  freq: FreqType;
  hour: number;
  minute: number;
}

// ===================== 组件 =====================

/**
 * WMS 报表调度器
 */
const WmsReportScheduler: React.FC = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState<boolean>(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [config, setConfig] = useState<ReportScheduleConfig>({
    reportType: 'inventory',
    warehouseId: '',
    freq: 'DAILY',
    hour: 9,
    minute: 0,
  });

  // 加载仓库列表
  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        const res = await fetch('/api/warehouses');
        if (res.ok) {
          const data = await res.json();
          setWarehouses(data.data || data || []);
        }
      } catch (err) {
        console.error('加载仓库列表失败:', err);
        showToast('加载仓库列表失败', 'error');
      }
    };

    loadWarehouses();
  }, [showToast]);

  // 处理报表类型变化
  const handleReportTypeChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    setConfig((prev) => ({
      ...prev,
      reportType: event.target.value as ReportType,
    }));
  };

  // 处理仓库选择变化
  const handleWarehouseChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    setConfig((prev) => ({
      ...prev,
      warehouseId: event.target.value as string,
    }));
  };

  // 处理频率变化
  const handleFreqChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setConfig((prev) => ({
      ...prev,
      freq: event.target.value as FreqType,
    }));
  };

  // 处理小时变化
  const handleHourChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10);
    if (!isNaN(value) && value >= 0 && value <= 23) {
      setConfig((prev) => ({ ...prev, hour: value }));
    }
  };

  // 处理分钟变化
  const handleMinuteChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10);
    if (!isNaN(value) && value >= 0 && value <= 59) {
      setConfig((prev) => ({ ...prev, minute: value }));
    }
  };

  // 创建定时任务
  const handleCreateTask = async () => {
    setLoading(true);

    try {
      // 构建任务配置
      const taskConfig = {
        reportConfig: {
          reportType: config.reportType,
          warehouseId: config.warehouseId || null,
          startDate: null,
          endDate: null,
          format: 'csv',
        },
      };

      // 构建 RRULE
      let rrule = `FREQ=${config.freq}`;
      rrule += `;BYHOUR=${config.hour};BYMINUTE=${config.minute}`;

      // 调用 API 创建自动化任务
      const res = await fetch('/api/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `WMS ${getReportTypeLabel(config.reportType)}报表生成`,
          description: `定期生成${getReportTypeLabel(config.reportType)}报表（${config.warehouseId ? '指定仓库' : '全部仓库'}）`,
          taskType: 'wms-report-gen',
          taskConfig: taskConfig.reportConfig,
          scheduleType: 'recurring',
          rrule,
          status: 'ACTIVE',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errData.error || res.statusText);
      }

      showToast('报表定时任务已创建', 'success');

      // 重置表单
      setConfig({
        reportType: 'inventory',
        warehouseId: '',
        freq: 'DAILY',
        hour: 9,
        minute: 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`创建任务失败: ${message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 获取报表类型标签
  const getReportTypeLabel = (type: ReportType): string => {
    const labels: Record<ReportType, string> = {
      inventory: '库存',
      inbound: '入库',
      outbound: '出库',
    };
    return labels[type] || type;
  };

  return (
    <Paper elevation={2} sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h6" gutterBottom>
        创建报表定时任务
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        配置定期自动生成 WMS 报表，支持库存、入库、出库三类报表。
      </Typography>

      <Divider sx={{ mb: 3 }} />

      {/* 报表类型 */}
      <Box sx={{ mb: 3 }}>
        <FormControl fullWidth size="small">
          <InputLabel>报表类型</InputLabel>
          <Select
            value={config.reportType}
            onChange={handleReportTypeChange as any}
            label="报表类型"
          >
            <MenuItem value="inventory">库存报表</MenuItem>
            <MenuItem value="inbound">入库报表</MenuItem>
            <MenuItem value="outbound">出库报表</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* 仓库选择 */}
      <Box sx={{ mb: 3 }}>
        <FormControl fullWidth size="small">
          <InputLabel>选择仓库</InputLabel>
          <Select
            value={config.warehouseId}
            onChange={handleWarehouseChange as any}
            label="选择仓库"
          >
            <MenuItem value="">全部仓库</MenuItem>
            {warehouses.map((wh) => (
              <MenuItem key={wh.id} value={wh.id}>
                {wh.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* 调度频率 */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          调度频率
        </Typography>
        <RadioGroup row value={config.freq} onChange={handleFreqChange}>
          <FormControlLabel value="DAILY" control={<Radio />} label="每天" />
          <FormControlLabel value="WEEKLY" control={<Radio />} label="每周" />
          <FormControlLabel value="MONTHLY" control={<Radio />} label="每月" />
        </RadioGroup>
      </Box>

      {/* 执行时间 */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          执行时间
        </Typography>
        <Stack direction="row" spacing={2}>
          <TextField
            label="小时"
            type="number"
            value={config.hour}
            onChange={handleHourChange}
            size="small"
            InputProps={{ inputProps: { min: 0, max: 23 } }}
            sx={{ width: 100 }}
          />
          <TextField
            label="分钟"
            type="number"
            value={config.minute}
            onChange={handleMinuteChange}
            size="small"
            InputProps={{ inputProps: { min: 0, max: 59 } }}
            sx={{ width: 100 }}
          />
        </Stack>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* 创建按钮 */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          onClick={handleCreateTask}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {loading ? '创建中...' : '创建定时任务'}
        </Button>
      </Box>
    </Paper>
  );
};

export default WmsReportScheduler;
