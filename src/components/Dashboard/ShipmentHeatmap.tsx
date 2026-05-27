import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Box, Typography, Card, CardHeader, CardContent, IconButton } from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { ALL_WAREHOUSES } from './WarehouseSelector';
import { subscribeWarehouses } from '../../stores/warehouseStore';
import { mockInboundRecords, mockOutboundRecords } from '../../data/mockData';
import { exportToCsv } from '../../utils/exportCsv';
import type { Warehouse } from '../../types';
import dayjs from 'dayjs';

/**
 * 仓库出入库热力图
 * X轴：日期（近 N 天）  Y轴：仓库
 * 颜色深浅表示当日出入库总件数
 * 悬停显示：入库件数、出库件数、总件数
 */

// 颜色方案 — 与 KPI 卡片色系统一，加深 max 色提高对比度
const COLOR_SCHEMES = {
  blue:  { min: '#EFF6FF', mid: '#60A5FA', max: '#1E40AF' },
  green: { min: '#F0FDF4', mid: '#34D399', max: '#065F46' },
  red:   { min: '#FEF2F2', mid: '#F87171', max: '#991B1B' },
};

type ColorScheme = keyof typeof COLOR_SCHEMES;

interface HeatCell {
  in: number;
  out: number;
}

/**
 * 将 mock 数据中的日期映射到今年对应日期
 */
function mapToCurrentYear(dateStr: string): string {
  const d = dayjs(dateStr);
  if (!d.isValid()) return '';
  return d.year(dayjs().year()).format('YYYY-MM-DD');
}

/** 生成热力图数据 */
function generateHeatmapData(days: number, warehouses: Warehouse[]) {
  const whList = warehouses.map((w) => ({ id: w.id, name: w.name }));
  const dates: string[] = [];
  const dateLabels: string[] = [];
  const dateDisplays: string[] = [];
  const monthLabels: { month: string; startIdx: number }[] = [];
  let lastMonth = '';

  for (let i = days - 1; i >= 0; i--) {
    const d = dayjs().subtract(i, 'day');
    const key = d.format('MM-DD');
    dates.push(key);
    dateLabels.push(d.format('D'));
    dateDisplays.push(d.format('M月D日'));

    const month = d.format('YYYY年M月');
    if (month !== lastMonth) {
      monthLabels.push({ month: d.format('M月'), startIdx: dates.length - 1 });
      lastMonth = month;
    }
  }

  const dateStrSet = new Set<string>();
  const dateStrToKey: Record<string, string> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = dayjs().subtract(i, 'day');
    const fullStr = d.format('YYYY-MM-DD');
    const key = d.format('MM-DD');
    dateStrSet.add(fullStr);
    dateStrToKey[fullStr] = key;
  }

  const agg: Record<string, Record<string, HeatCell>> = {};

  const addRecord = (whId: string, dateStr: string, qty: number, type: 'in' | 'out') => {
    const mappedDate = mapToCurrentYear(dateStr);
    if (!dateStrSet.has(mappedDate)) return;
    if (!agg[whId]) agg[whId] = {};
    const key = dateStrToKey[mappedDate];
    if (!agg[whId][key]) agg[whId][key] = { in: 0, out: 0 };
    agg[whId][key][type] += qty;
  };

  mockInboundRecords.forEach((r) => addRecord(r.warehouseId, r.createdAt, r.quantity, 'in'));
  mockOutboundRecords.forEach((r) => addRecord(r.warehouseId, r.createdAt, r.quantity, 'out'));

  const data: Record<string, Record<string, HeatCell | null>> = {};
  whList.forEach((w) => {
    data[w.id] = {};
    dates.forEach((d) => {
      data[w.id][d] = agg[w.id]?.[d] ?? null;
    });
  });

  return { warehouses: whList, dates, dateLabels, dateDisplays, monthLabels, data };
}

/**
 * 计算 quantile 阈值，用于非线性颜色映射
 * 数据分布不均时，25/50/75/90 分位比线性映射更直观
 */
function calcThresholds(values: number[], quantiles: number[]): number[] {
  if (values.length === 0) return quantiles.map(() => 0);
  const sorted = [...values].sort((a, b) => a - b);
  return quantiles.map((q) => {
    const idx = Math.min(Math.floor(q * sorted.length), sorted.length - 1);
    return sorted[idx];
  });
}

/**
 * 基于分位数的颜色映射，数据分布更明显
 * null → 浅灰（无数据），0 → 白色（有数据但为0）
 */
function getHeatColor(cell: HeatCell | null, thresholds: number[], scheme: ColorScheme): string {
  if (cell === null) return '#F3F4F6'; // 无数据
  const total = cell.in + cell.out;
  if (total === 0) return '#F9FAFB'; // 有数据但件数为0

  const colors = COLOR_SCHEMES[scheme];
  const stops = [
    colors.min,
    lerpColor(colors.min, colors.mid, 0.5),
    colors.mid,
    lerpColor(colors.mid, colors.max, 0.5),
    colors.max,
  ];

  // 找到 total 对应的阈值区间
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (total >= thresholds[i]) return stops[i + 1];
  }
  return stops[0];
}

/** 线性插值两个 hex 颜色 */
function lerpColor(a: string, b: string, t: number): string {
  t = Math.max(0, Math.min(1, t));
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

interface ShipmentHeatmapProps {
  warehouseId: string;
}

const ShipmentHeatmap: React.FC<ShipmentHeatmapProps> = ({ warehouseId }) => {
  const { settings } = useAppSettings();
  const heatmapSettings = settings.dashboard.heatmap;
  const days = heatmapSettings?.days ?? 14;
  const colorScheme: ColorScheme = (heatmapSettings?.colorScheme as ColorScheme) ?? 'blue';

  const [hoveredCell, setHoveredCell] = useState<{
    warehouse: string;
    warehouseName: string;
    date: string;
    dateDisplay: string;
    cell: HeatCell | null;
    total: number | null;
  } | null>(null);

  const [allWarehouses, setAllWarehouses] = useState<Warehouse[]>([]);

  useEffect(() => {
    const unsub = subscribeWarehouses(setAllWarehouses);
    return unsub;
  }, []);

  const rawData = useMemo(() => generateHeatmapData(days, allWarehouses), [days, allWarehouses]);

  const { warehouses, dates, dateLabels, dateDisplays, monthLabels, data } = useMemo(() => {
    if (warehouseId === ALL_WAREHOUSES) return rawData;
    return {
      ...rawData,
      warehouses: rawData.warehouses.filter((w) => w.id === warehouseId),
    };
  }, [rawData, warehouseId]);

  /** 所有单元格的总件数，用于计算分位数阈值 */
  const allValues = useMemo(() => {
    const vals: number[] = [];
    Object.values(data).forEach((row) => {
      Object.values(row).forEach((cell) => {
        if (cell) vals.push(cell.in + cell.out);
      });
    });
    return vals;
  }, [data]);

  /** 分位数阈值：25%, 50%, 75%, 90% */
  const thresholds = useMemo(() => calcThresholds(allValues, [0.25, 0.5, 0.75, 0.9]), [allValues]);

  // ==================== 导出热力图数据 ====================
  const handleExport = () => {
    const csvHeaders = ['仓库名称', ...dates.map((d) => dateDisplays[dates.indexOf(d)])];
    const csvRows: string[][] = [];
    warehouses.forEach((wh) => {
      const row: string[] = [wh.name];
      dates.forEach((date) => {
        const cell = data[wh.id]?.[date] ?? null;
        if (cell) {
          row.push(`${cell.in}+${cell.out}`);
        } else {
          row.push('-');
        }
      });
      csvRows.push(row);
    });
    exportToCsv('heatmap_data.csv', csvHeaders, csvRows);
  };

  // ====== 自适应布局计算 ======
  const cellGap = 3;
  const maxLabelChars = 8;
  const labelWidth = maxLabelChars * 12 + 12; // 仓库名标签宽度
  const labelGap = 10;

  // 自适应 cellSize：天数越多，格子越小，范围 20~28px
  const cellSize = useMemo(() => {
    if (days <= 7) return 28;
    if (days <= 14) return 24;
    if (days <= 30) return 20;
    return 18;
  }, [days]);

  const padding = { top: 48, right: 20, bottom: 12, left: 0 };
  const svgContentWidth = labelWidth + dates.length * (cellSize + cellGap);
  const svgContentHeight = padding.top + warehouses.length * (cellSize + cellGap) + padding.bottom;

  const schemeColors = COLOR_SCHEMES[colorScheme];

  // 没有仓库时显示空状态
  if (warehouses.length === 0) {
    return (
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}>
        <CardHeader
          title={
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
              仓库出入库热力图
            </Typography>
          }
          subheader={
            <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
              近 {days} 天 · 件数
            </Typography>
          }
        />
        <CardContent>
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.875rem', color: '#9CA3AF', mb: 1 }}>
              暂无仓库数据，请先添加仓库
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#D1D5DB' }}>
              热力图将展示各仓库每日出入库件数分布
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}>
      <CardHeader
        title={
          <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
            仓库出入库热力图
          </Typography>
        }
        subheader={
          <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
            近 {days} 天 · 悬停查看详情
          </Typography>
        }
        sx={{ pb: 0.5 }}
      />

      <CardContent sx={{ pt: 0.5, pb: 1.5 }}>
        <Box sx={{ width: '100%', overflowX: 'auto' }}>
          <svg
            width="100%"
            viewBox={`0 0 ${svgContentWidth} ${svgContentHeight}`}
            preserveAspectRatio="xMinYMin meet"
            style={{ display: 'block', minHeight: svgContentHeight }}
          >
            <defs>
              {/* 渐变图例 */}
              <linearGradient id={`heatmap-gradient-${colorScheme}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={schemeColors.min} />
                <stop offset="50%" stopColor={schemeColors.mid} />
                <stop offset="100%" stopColor={schemeColors.max} />
              </linearGradient>
              {/* 悬停高亮滤镜 */}
              <filter id="cell-hover-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.15" />
              </filter>
            </defs>

            {/* 月份标签 */}
            {monthLabels.map((ml, idx) => {
              const nextStart = idx < monthLabels.length - 1 ? monthLabels[idx + 1].startIdx : dates.length;
              const midIdx = Math.floor((ml.startIdx + nextStart) / 2);
              const x = labelWidth + midIdx * (cellSize + cellGap) + cellSize / 2;
              return (
                <text
                  key={ml.month}
                  x={x}
                  y={14}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill="#6B7280"
                  fontFamily="-apple-system, sans-serif"
                >
                  {ml.month}
                </text>
              );
            })}

            {/* 日期标签 */}
            {dateLabels.map((label, i) => (
              <text
                key={dates[i]}
                x={labelWidth + i * (cellSize + cellGap) + cellSize / 2}
                y={padding.top - 8}
                textAnchor="middle"
                fontSize={9}
                fill="#9CA3AF"
                fontFamily="-apple-system, sans-serif"
              >
                {label}
              </text>
            ))}

            {/* 热力图格子 */}
            {warehouses.map((wh, rowIdx) => {
              const y = padding.top + rowIdx * (cellSize + cellGap);
              return (
                <g key={wh.id}>
                  {/* 仓库名称标签 */}
                  <text
                    x={labelWidth - labelGap}
                    y={y + cellSize / 2 + 4}
                    textAnchor="end"
                    fontSize={11}
                    fill="#374151"
                    fontWeight={500}
                    fontFamily="-apple-system, sans-serif"
                  >
                    <title>{wh.name}</title>
                    {wh.name.length > maxLabelChars ? wh.name.slice(0, maxLabelChars - 1) + '…' : wh.name}
                  </text>

                  {/* 日期格子 */}
                  {dates.map((date, colIdx) => {
                    const cell = data[wh.id]?.[date] ?? null;
                    const color = getHeatColor(cell, thresholds, colorScheme);
                    const x = labelWidth + colIdx * (cellSize + cellGap);
                    const isHovered =
                      hoveredCell?.warehouse === wh.id && hoveredCell?.date === date;

                    return (
                      <g key={`${wh.id}-${date}`}>
                        <rect
                          x={x}
                          y={y}
                          width={cellSize}
                          height={cellSize}
                          rx={4}
                          fill={color}
                          opacity={0.92}
                          stroke={isHovered ? '#111827' : 'rgba(255,255,255,0.6)'}
                          strokeWidth={isHovered ? 2 : 1}
                          style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                          filter={isHovered ? 'url(#cell-hover-shadow)' : undefined}
                          transform={isHovered ? `translate(${-1}, ${-1}) scale(1.08)` : undefined}
                          onMouseEnter={() => {
                            const total = cell ? cell.in + cell.out : null;
                            setHoveredCell({
                              warehouse: wh.id,
                              warehouseName: wh.name,
                              date,
                              dateDisplay: dateDisplays[colIdx],
                              cell,
                              total,
                            });
                          }}
                          onMouseLeave={() => setHoveredCell(null)}
                        />
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </Box>

        {/* 悬停提示 */}
        {hoveredCell && (
          <Box
            sx={{
              mt: 1.5,
              px: 2,
              py: 1,
              backgroundColor: '#F9FAFB',
              borderRadius: 1.5,
              border: '1px solid #E5E7EB',
              display: 'inline-flex',
              flexDirection: 'column',
              gap: 0.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827' }}>
                {hoveredCell.warehouseName}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>·</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
                {hoveredCell.dateDisplay}
              </Typography>
            </Box>
            {hoveredCell.cell ? (
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '2px', backgroundColor: COLOR_SCHEMES[colorScheme].min }} />
                  <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
                    入库 {hoveredCell.cell.in} 件
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '2px', backgroundColor: COLOR_SCHEMES[colorScheme].max }} />
                  <Typography sx={{ fontSize: '0.75rem', color: '#6B7280' }}>
                    出库 {hoveredCell.cell.out} 件
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#111827' }}>
                  共 {hoveredCell.total} 件
                </Typography>
              </Box>
            ) : (
              <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                无数据
              </Typography>
            )}
          </Box>
        )}

        {/* 图例：渐变条 + 说明 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '3px', backgroundColor: '#F3F4F6', border: '1px solid #E5E7EB' }} />
            <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>无数据</Typography>
          </Box>
          <Typography sx={{ fontSize: '0.7rem', color: '#D1D5DB' }}>|</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>少</Typography>
          <svg width={72} height={12} style={{ borderRadius: 3 }}>
            <rect width={72} height={12} rx={3} fill={`url(#heatmap-gradient-${colorScheme})`} />
          </svg>
          <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>多</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: '#D1D5DB' }}>|</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '2px', backgroundColor: COLOR_SCHEMES[colorScheme].min }} />
              <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF' }}>入库</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '2px', backgroundColor: COLOR_SCHEMES[colorScheme].max }} />
              <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF' }}>出库</Typography>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default ShipmentHeatmap;
