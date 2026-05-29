/**
 * WidgetDashboard - 桌面 Widget 面板
 * 极简黑白灰风格，透明背景兼容
 * 视口：320x480
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
import StorefrontIcon from '@mui/icons-material/Storefront';
import InventoryIcon from '@mui/icons-material/Inventory';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { subscribeWarehouses } from '../stores/warehouseStore';
import type { Warehouse } from '../stores/warehouseStore';

/** 预警阈值（利用率 >= 此值触发预警） */
const WARNING_THRESHOLD = 70;

/** 在途运单 mock 数据 */
const MOCK_TRANSIT_COUNT = 25;

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}

/**
 * Widget KPI 卡片 — 极小尺寸、无阴影、细边框
 */
const WidgetKpiCard: React.FC<KpiCardProps> = ({ title, value, icon }) => (
  <Card
    elevation={0}
    sx={{
      border: '1px solid #E5E7EB',
      borderRadius: 2,
      bgcolor: 'transparent',
      height: '100%',
    }}
  >
    <CardContent sx={{ p: '10px 12px', '&:last-child': { pb: '10px' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
        <Typography
          sx={{
            fontSize: '0.75rem',
            fontWeight: 500,
            color: '#6B7280',
            lineHeight: 1.3,
          }}
        >
          {title}
        </Typography>
        <Box sx={{ color: '#9CA3AF', display: 'flex', alignItems: 'center' }}>
          {icon}
        </Box>
      </Box>
      <Typography
        sx={{
          fontSize: '1.5rem',
          fontWeight: 700,
          color: '#111827',
          lineHeight: 1.2,
        }}
      >
        {value}
      </Typography>
    </CardContent>
  </Card>
);

const WidgetDashboard: React.FC = () => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // 订阅仓库数据变化
  useEffect(() => {
    const unsub = subscribeWarehouses(setWarehouses);
    return unsub;
  }, []);

  // 仓库总数
  const totalWarehouses = useMemo(() => warehouses.length, [warehouses]);

  // 总库存件数（所有仓库 usedItems 之和）
  const totalUsedItems = useMemo(
    () => warehouses.reduce((sum, w) => sum + (w.usedItems || 0), 0),
    [warehouses]
  );

  // 预警通知（利用率 >= 70% 的仓库数）
  const warningCount = useMemo(
    () =>
      warehouses.filter((w) => {
        const total = w.totalItems || 1;
        const used = w.usedItems || 0;
        const utilization = (used / total) * 100;
        return utilization >= WARNING_THRESHOLD;
      }).length,
    [warehouses]
  );

  // 在途运单（mock）
  const transitCount = MOCK_TRANSIT_COUNT;

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        p: 1.5,
        boxSizing: 'border-box',
        bgcolor: 'transparent',
      }}
    >
      {/* 2列网格布局，适配 320px 宽度 */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 1.5,
        }}
      >
        <WidgetKpiCard
          title="仓库总数"
          value={totalWarehouses}
          icon={<StorefrontIcon sx={{ fontSize: '1.125rem' }} />}
        />
        <WidgetKpiCard
          title="总库存件数"
          value={totalUsedItems.toLocaleString()}
          icon={<InventoryIcon sx={{ fontSize: '1.125rem' }} />}
        />
        <WidgetKpiCard
          title="预警通知"
          value={warningCount}
          icon={<WarningAmberIcon sx={{ fontSize: '1.125rem' }} />}
        />
        <WidgetKpiCard
          title="在途运单"
          value={transitCount}
          icon={<LocalShippingIcon sx={{ fontSize: '1.125rem' }} />}
        />
      </Box>
    </Box>
  );
};

export default WidgetDashboard;
