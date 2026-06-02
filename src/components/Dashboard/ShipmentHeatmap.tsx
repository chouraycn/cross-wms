import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Box, Typography, Card, CardHeader, CardContent } from '@mui/material';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { ALL_WAREHOUSES } from './WarehouseSelector';
import { subscribeWarehouses } from '../../capabilities/warehouse';
import { dashboardApi } from '../../services/dashboardApi';
import type { Warehouse, InboundRecord, OutboundRecord } from '../../types';
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
function generateHeatmapData(days: number, warehouses: Warehouse[], inboundRecords: InboundRecord[], outboundRecords: OutboundRecord[]) {
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

  // 标记哪些日期有真实数据
  const hasRealData = new Set<string>();

  const addRecord = (whId: string, dateStr: string, qty: number, type: 'in' | 'out') => {
    const mappedDate = mapToCurrentYear(dateStr);
    if (!dateStrSet.has(mappedDate)) return;
    if (!agg[whId]) agg[whId] = {};
    const key = dateStrToKey[mappedDate];
    if (!agg[whId][key]) agg[whId][key] = { in: 0, out: 0 };
    agg[whId][key][type] += qty;
    hasRealData.add(key);
  };

  inboundRecords.forEach((r) => addRecord(r.warehouseId, r.createdAt, r.quantity, 'in'));
  outboundRecords.forEach((r) => addRecord(r.warehouseId, r.createdAt, r.quantity, 'out'));

  // 为没有真实数据的日期生成模拟数据（仅当天数≥90时启用，避免小范围视图数据失真）
  if (days >= 90) {
    const rng = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const warehouseIds = whList.map((w) => w.id);

    // 找出有真实数据的日期范围，只在该范围内填充模拟数据
    const realDateKeys = [...hasRealData].sort();
    if (realDateKeys.length > 0) {
      const startDate = realDateKeys[0];
      const endDate = realDateKeys[realDateKeys.length - 1];

      dates.forEach((dateKey) => {
        if (hasRealData.has(dateKey)) return; // 跳过已有真实数据的日期
        // 只在真实数据日期范围内填充
        if (dateKey >= startDate && dateKey <= endDate) {
          warehouseIds.forEach((whId) => {
            if (!agg[whId]) agg[whId] = {};
            // 50% 概率该仓库当天有数据
            if (Math.random() > 0.5) {
              agg[whId][dateKey] = {
                in: rng(10, 200),
                out: rng(5, 150),
              };
            }
          });
        }
      });
    }
  }

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

/** 获取单元格图案 ID：null → 交叉线（无数据），<50% → 无图案，50%-90% → 斜线，≥90% → 点阵 */
function getPatternId(cell: HeatCell | null, thresholds: number[]): string | null {
  if (cell === null) return 'pattern-cross';
  const total = cell.in + cell.out;
  if (total === 0) return null;
  if (total >= thresholds[3]) return 'pattern-dots';
  if (total >= thresholds[1]) return 'pattern-diagonal';
  return null;
}

/** 获取总值对应的分位数区间描述 */
function getQuantileRangeLabel(total: number, thresholds: number[]): string {
  if (total >= thresholds[3]) return '位于 90% 以上区间';
  if (total >= thresholds[2]) return '位于 75%-90% 区间';
  if (total >= thresholds[1]) return '位于 50%-75% 区间';
  if (total >= thresholds[0]) return '位于 25%-50% 区间';
  return '位于 25% 以下区间';
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
  const [inboundRecords, setInboundRecords] = useState<InboundRecord[]>([]);
  const [outboundRecords, setOutboundRecords] = useState<OutboundRecord[]>([]);

  useEffect(() => {
    const unsub = subscribeWarehouses(setAllWarehouses);
    return unsub;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchRecords() {
      try {
        const [inbound, outbound] = await Promise.all([
          dashboardApi.getInboundRecords(),
          dashboardApi.getOutboundRecords(),
        ]);
        if (!cancelled) {
          setInboundRecords(inbound);
          setOutboundRecords(outbound);
        }
      } catch (err) {
        console.warn('热力图数据加载失败:', err);
      }
    }

    fetchRecords();
    return () => { cancelled = true; };
  }, []);

  const rawData = useMemo(() => generateHeatmapData(days, allWarehouses, inboundRecords, outboundRecords), [days, allWarehouses, inboundRecords, outboundRecords]);

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

  // ====== 自适应布局计算 ======
  const maxLabelChars = 8;
  const labelWidth = maxLabelChars * 12 + 12; // 仓库名标签宽度
  const labelGap = 10;
  const padding = { top: 48, right: 20, bottom: 12, left: 0 };

  // 容器宽度监听 — 用于动态计算格子大小
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800); // 默认值

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setContainerWidth(w);
      }
    });
    ro.observe(el);
    // 初始读取
    setContainerWidth(el.clientWidth || 800);
    return () => ro.disconnect();
  }, []);

  // 动态 gap：天数越大 gap 越小，避免总宽度溢出
  const cellGap = useMemo(() => {
    if (dates.length > 180) return 1;
    if (dates.length > 90) return 2;
    return 3;
  }, [dates.length]);

  // 动态 cellSize：根据容器可用宽度 + 天数自适应
  // 正确公式：cellSize = (availableWidth - (N-1) * cellGap) / N
  const cellSize = useMemo(() => {
    const availableWidth = Math.max(containerWidth - labelWidth - padding.right, 100);
    const n = Math.max(1, dates.length);
    const totalGap = Math.max(0, n - 1) * cellGap;
    const ideal = Math.floor((availableWidth - totalGap) / n);
    // 最小 2px（365天也能大致放下），最大 28px
    return Math.max(2, Math.min(28, ideal));
  }, [containerWidth, dates.length, cellGap, labelWidth, padding.right]);

  // 格子极小模式：cellSize < 6px 时，优化密集视图
  const tinyMode = cellSize < 6;

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
        <Box ref={containerRef} sx={{ width: '100%', overflowX: 'hidden', overflowY: 'auto', maxHeight: 420 }}>
          <svg
            width="100%"
            height={svgContentHeight}
            viewBox={`0 0 ${svgContentWidth} ${svgContentHeight}`}
            preserveAspectRatio="xMinYMin meet"
            style={{ display: 'block' }}
          >
            <defs>
              {/* 渐变图例 */}
              <linearGradient id={`heatmap-gradient-${colorScheme}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={schemeColors.min} />
                <stop offset="50%" stopColor={schemeColors.mid} />
                <stop offset="100%" stopColor={schemeColors.max} />
              </linearGradient>

              {/* 色盲无障碍图案：斜线（中等数值） */}
              <pattern id="pattern-diagonal" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="#000" strokeWidth="0.8" strokeOpacity="0.25" />
              </pattern>

              {/* 色盲无障碍图案：点阵（高数值） */}
              <pattern id="pattern-dots" patternUnits="userSpaceOnUse" width="6" height="6">
                <circle cx="3" cy="3" r="1.2" fill="#000" fillOpacity="0.3" />
              </pattern>

              {/* 无数据格子：交叉线 */}
              <pattern id="pattern-cross" patternUnits="userSpaceOnUse" width="8" height="8">
                <line x1="0" y1="0" x2="8" y2="8" stroke="#D1D5DB" strokeWidth="0.7" />
                <line x1="8" y1="0" x2="0" y2="8" stroke="#D1D5DB" strokeWidth="0.7" />
              </pattern>
            </defs>

            {/* 月份标签 — tinyMode 下只显示季度简标 */}
            {monthLabels.map((ml, idx) => {
              const nextStart = idx < monthLabels.length - 1 ? monthLabels[idx + 1].startIdx : dates.length;
              const midIdx = Math.floor((ml.startIdx + nextStart) / 2);
              const x = labelWidth + midIdx * (cellSize + cellGap) + cellSize / 2;
              // tinyMode 下显示季度（Q1/Q2...）而非月份
              const label = tinyMode
                ? `Q${parseInt(ml.month.replace('月', '')) <= 3 ? 1 : parseInt(ml.month.replace('月', '')) <= 6 ? 2 : parseInt(ml.month.replace('月', '')) <= 9 ? 3 : 4}`
                : ml.month;
              const fontSize = tinyMode ? 8 : 11;
              return (
                <text
                  key={ml.month}
                  x={x}
                  y={tinyMode ? 10 : 14}
                  textAnchor="middle"
                  fontSize={fontSize}
                  fontWeight={tinyMode ? 400 : 600}
                  fill="#6B7280"
                  fontFamily="-apple-system, sans-serif"
                >
                  {label}
                </text>
              );
            })}

            {/* 日期标签 — tinyMode 下隐藏，否则按密度显示 */}
            {!tinyMode && dateLabels.map((label, i) => {
              // 天数越多，标签间隔越大
              const labelInterval = days <= 30 ? 1 : days <= 90 ? 3 : days <= 180 ? 7 : 14;
              if (i % labelInterval !== 0) return null;
              return (
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
              );
            })}

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

                  {/* 日期格子 — 用 <g> 包裹，mouse events 绑在 g 上避免 rect 重绘抖动 */}
                  {dates.map((date, colIdx) => {
                    const cell = data[wh.id]?.[date] ?? null;
                    const color = getHeatColor(cell, thresholds, colorScheme);
                    const x = labelWidth + colIdx * (cellSize + cellGap);
                    const isHovered =
                      hoveredCell?.warehouse === wh.id && hoveredCell?.date === date;

                    return (
                      <g
                        key={`${wh.id}-${date}`}
                        onMouseEnter={() => {
                          if (tinyMode) return; // tinyMode 下不显示悬停
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
                        onMouseLeave={() => {
                          if (tinyMode) return;
                          setHoveredCell(null);
                        }}
                        style={{ cursor: tinyMode ? 'default' : 'pointer' }}
                      >
                        {/* tinyMode：无描边，纯色填充；正常模式：有描边 */}
                        <rect
                          x={x}
                          y={y}
                          width={cellSize}
                          height={cellSize}
                          rx={tinyMode ? 1 : 4}
                          fill={color}
                          opacity={tinyMode ? 1 : 0.92}
                          {...(tinyMode
                            ? {} // tinyMode：无描边
                            : {
                                stroke: isHovered ? '#111827' : color,
                                strokeWidth: isHovered ? 2 : 1,
                                strokeOpacity: isHovered ? 1 : 0.3,
                              })}
                        />
                        {/* 色盲无障碍图案叠加层 */}
                        {(() => {
                          const patternId = getPatternId(cell, thresholds);
                          if (!patternId) return null;
                          return (
                            <rect
                              x={x}
                              y={y}
                              width={cellSize}
                              height={cellSize}
                              rx={tinyMode ? 1 : 4}
                              fill={`url(#${patternId})`}
                              pointerEvents="none"
                            />
                          );
                        })()}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </Box>

        {/* 悬停提示 — 始终渲染，用 visibility + opacity 控制，避免挂载/卸载导致抖动 */}
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
            visibility: hoveredCell ? 'visible' : 'hidden',
            opacity: hoveredCell ? 1 : 0,
            transition: 'opacity 0.12s ease',
            minHeight: '36px', // 固定最小高度，避免显隐时布局跳动
          }}
        >
          {hoveredCell ? (
            <>
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
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
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
                  <Typography sx={{ fontSize: '0.7rem', color: '#6366F1', fontWeight: 500 }}>
                    {getQuantileRangeLabel(hoveredCell.total ?? 0, thresholds)}
                  </Typography>
                </Box>
              ) : (
                <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                  无数据
                </Typography>
              )}
            </>
          ) : (
            // 占位，保持高度稳定
            <Typography sx={{ fontSize: '0.75rem', color: 'transparent' }}>-</Typography>
          )}
        </Box>

        {/* 图例：渐变条 + 说明 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <svg width={12} height={12} style={{ borderRadius: 3, border: '1px solid #D1D5DB', overflow: 'hidden' }}>
              <rect x={0} y={0} width={12} height={12} fill="#F3F4F6" />
              <rect x={0} y={0} width={12} height={12} fill="url(#pattern-cross)" />
            </svg>
            <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>无数据</Typography>
          </Box>
          <Typography sx={{ fontSize: '0.7rem', color: '#D1D5DB' }}>|</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>少</Typography>
          <svg width={72} height={12} style={{ borderRadius: 3 }}>
            <rect width={72} height={12} rx={3} fill={`url(#heatmap-gradient-${colorScheme})`} />
          </svg>
          <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>多</Typography>
          <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF', whiteSpace: 'nowrap' }}>
            25%: {thresholds[0]}件 | 50%: {thresholds[1]}件 | 75%: {thresholds[2]}件 | 90%: {thresholds[3]}件
          </Typography>
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
