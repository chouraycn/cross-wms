import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
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
 * GitHub 风格仓库出货日历热力图
 * 布局：星期（日~六）× 周数，类似 GitHub Contributions 图
 * 支持单个仓库 / 全部聚合
 * 全新 Ocean 蓝色系配色
 */

// ── 颜色方案：Ocean 海洋系（现代、清爽、层次分明）──
const OCEAN = {
  empty:  '#F8FAFC',       // slate-50  无数据
  level0: '#E0F2FE',       // sky-100   1-20 件
  level1: '#7DD3FC',       // sky-300   21-50 件
  level2: '#0EA5E9',       // sky-500   51-100 件
  level3: '#0369A1',       // sky-700   101-200 件
  level4: '#082F49',       // sky-950   200+ 件
};

const FOREST = {
  empty:  '#F8FAFC',
  level0: '#DCFCE7',       // green-100
  level1: '#86EFAC',       // green-300
  level2: '#22C55E',       // green-500
  level3: '#15803D',       // green-700
  level4: '#052E16',       // green-950
};

const SUNSET = {
  empty:  '#F8FAFC',
  level0: '#FED7AA',       // orange-100
  level1: '#FDBA74',       // orange-300
  level2: '#F97316',       // orange-500
  level3: '#C2410C',       // orange-700
  level4: '#431407',       // orange-950
};

const COLOR_SCHEMES = { ocean: OCEAN, forest: FOREST, sunset: SUNSET };
type ColorScheme = keyof typeof COLOR_SCHEMES;

interface DayCell {
  date: string;       // YYYY-MM-DD
  display: string;     // M月D日
  weekday: number;     // 0=周日
  weekIndex: number;   // 第几周
  total: number;       // 当天总件数
  level: number;       // 0-4
}

interface WeekColumn {
  weekIndex: number;
  monthLabel: string;
  days: (DayCell | null)[];  // 长度 7，null 表示空白
}

function mapToCurrentYear(dateStr: string): string {
  const d = dayjs(dateStr);
  if (!d.isValid()) return '';
  return d.year(dayjs().year()).format('YYYY-MM-DD');
}

/** 聚合指定时间范围内的每日出货量 */
function generateCalendarData(days: number, warehouses: Warehouse[], targetWhId: string) {
  const whList = targetWhId === ALL_WAREHOUSES
    ? warehouses
    : warehouses.filter(w => w.id === targetWhId);

  const today = dayjs().endOf('day');
  const startDate = today.subtract(days - 1, 'day').startOf('day');

  // 初始化每日数据
  const dayMap: Record<string, number> = {};
  for (let i = 0; i < days; i++) {
    const d = startDate.add(i, 'day');
    dayMap[d.format('YYYY-MM-DD')] = 0;
  }

  // 聚合 mock 数据
  const addRecord = (dateStr: string, qty: number) => {
    const mapped = mapToCurrentYear(dateStr);
    if (mapped && mapped in dayMap) {
      dayMap[mapped] += qty;
    }
  };

  mockInboundRecords.forEach(r => {
    if (targetWhId !== ALL_WAREHOUSES && r.warehouseId !== targetWhId) return;
    if (targetWhId === ALL_WAREHOUSES && !whList.find(w => w.id === r.warehouseId)) return;
    addRecord(r.createdAt, r.quantity);
  });
  mockOutboundRecords.forEach(r => {
    if (targetWhId !== ALL_WAREHOUSES && r.warehouseId !== targetWhId) return;
    if (targetWhId === ALL_WAREHOUSES && !whList.find(w => w.id === r.warehouseId)) return;
    addRecord(r.createdAt, r.quantity);
  });

  // 找出最大值用于分级
  const values = Object.values(dayMap).filter(v => v > 0);
  const maxVal = values.length > 0 ? Math.max(...values) : 0;

  // 生成 DayCell 列表
  const cells: DayCell[] = [];
  const sortedDates = Object.keys(dayMap).sort();
  sortedDates.forEach(dateStr => {
    const total = dayMap[dateStr];
    const d = dayjs(dateStr);
    const level = total === 0 ? -1 : calcLevel(total, maxVal);
    cells.push({
      date: dateStr,
      display: d.format('M月D日'),
      weekday: d.day(),       // 0=周日
      weekIndex: Math.floor(d.diff(startDate, 'day') / 7),
      total,
      level,
    });
  });

  return { cells, maxVal, whCount: whList.length };
}

/** 根据值计算等级 0-4 */
function calcLevel(value: number, max: number): number {
  if (max === 0) return 0;
  const ratio = value / max;
  if (ratio <= 0.05) return 0;
  if (ratio <= 0.3) return 1;
  if (ratio <= 0.6) return 2;
  if (ratio <= 0.9) return 3;
  return 4;
}

/** 淡化十六进制颜色（增加亮度），amount 为 0-100 的亮度增量百分比 */
function lightenColor(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  r = Math.min(255, r + Math.round((255 - r) * amount / 100));
  g = Math.min(255, g + Math.round((255 - g) * amount / 100));
  b = Math.min(255, b + Math.round((255 - b) * amount / 100));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** 将 cells 按周分组，生成列数据 */
function buildWeekColumns(cells: DayCell[]): WeekColumn[] {
  const weekMap: Record<number, DayCell[]> = {};
  cells.forEach(cell => {
    if (!weekMap[cell.weekIndex]) weekMap[cell.weekIndex] = [];
    weekMap[cell.weekIndex].push(cell);
  });

  const columns: WeekColumn[] = [];
  const monthSeen = new Set<string>();

  Object.keys(weekMap).sort((a, b) => +a - +b).forEach(weekIdxStr => {
    const weekIdx = +weekIdxStr;
    const weekCells = weekMap[weekIdx];
    const firstCell = weekCells.reduce((a, b) => a.date < b.date ? a : b);
    const monthKey = dayjs(firstCell.date).format('YYYY-M');
    let monthLabel = '';
    if (!monthSeen.has(monthKey)) {
      monthSeen.add(monthKey);
      monthLabel = dayjs(firstCell.date).format('M月');
    }

    // 构建 7 长度的数组，按星期排列（0=周日）
    const dayArr: (DayCell | null)[] = new Array(7).fill(null);
    weekCells.forEach(cell => {
      dayArr[cell.weekday] = cell;
    });

    columns.push({ weekIndex: weekIdx, monthLabel, days: dayArr });
  });

  return columns;
}

interface GitHubHeatmapProps {
  warehouseId: string;
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const CELL_GAP = 3;           // 格子间距 3px
const WEEKDAY_LABEL_WIDTH = 36; // 左侧星期标签宽 36px
const MONTH_LABEL_HEIGHT = 20;
const LEGEND_LABELS = ['无', '少', '中', '多', '满'];
const MAX_CELL_SIZE = 100;    // 最大格子尺寸（不设上限，让格子铺满）
const MIN_CELL_SIZE = 4;      // 最小格子尺寸

const GitHubHeatmap: React.FC<GitHubHeatmapProps> = ({ warehouseId }) => {
  const { settings } = useAppSettings();
  const heatmapSettings = settings.dashboard.heatmap;
  const days = heatmapSettings?.days ?? 90;
  const colorScheme = (heatmapSettings?.colorScheme as ColorScheme) ?? 'ocean';
  const colors = COLOR_SCHEMES[colorScheme] || OCEAN;

  const [hoveredCell, setHoveredCell] = useState<DayCell | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    x: number;          // tooltip 中心 X（SVG 坐标）
    y: number;          // 格子顶部 Y（SVG 坐标）
    showBelow: boolean;  // 是否显示在格子下方（空间不足时）
  } | null>(null);
  const [allWarehouses, setAllWarehouses] = useState<Warehouse[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const unsub = subscribeWarehouses(setAllWarehouses);
    return unsub;
  }, []);

  const { cells, maxVal, whCount } = useMemo(
    () => generateCalendarData(days, allWarehouses, warehouseId),
    [days, allWarehouses, warehouseId]
  );

  const weekColumns = useMemo(() => buildWeekColumns(cells), [cells]);

  // cellSize：固定 14px（紧凑风格，类似 GitHub 原版）
  const cellSize = 14;

  // 总出货量
  const totalShipments = useMemo(() => cells.reduce((s, c) => s + c.total, 0), [cells]);

  // 活跃天数
  const activeDays = useMemo(() => cells.filter(c => c.total > 0).length, [cells]);

  // SVG viewBox 尺寸 — 让格子铺满容器
  const svgViewBoxWidth = WEEKDAY_LABEL_WIDTH + weekColumns.length * (cellSize + CELL_GAP);
  const svgViewBoxHeight = MONTH_LABEL_HEIGHT + 7 * (cellSize + CELL_GAP);

  // 容器高度 = SVG 内容高度 + 边距（tooltip 已在 SVG 内部，无需额外空间）
  const containerHeightCalc = useMemo(() => {
    return `${svgViewBoxHeight + 24}px`;
  }, [svgViewBoxHeight]);

  const getColor = (level: number): string => {
    if (level === -1) return colors.empty;
    const map: Record<number, string> = {
      0: colors.level0,
      1: colors.level1,
      2: colors.level2,
      3: colors.level3,
      4: colors.level4,
    };
    return map[level] || colors.empty;
  };

  // 没有仓库时显示空状态
  if (allWarehouses.length === 0) {
    return (
      <Card elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}>
        <CardHeader
          title={
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
              出货日历热力图
            </Typography>
          }
          subheader={
            <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
              近 {days} 天 · GitHub 风格
            </Typography>
          }
        />
        <CardContent>
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.875rem', color: '#9CA3AF', mb: 1 }}>
              暂无仓库数据，请先添加仓库
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#D1D5DB' }}>
              热力图将展示每日出货趋势
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: '#111827' }}>
              出货日历热力图
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
              {warehouseId === ALL_WAREHOUSES
                ? `全部 ${whCount} 个仓库 · 共 ${totalShipments} 件`
                : `${allWarehouses.find(w => w.id === warehouseId)?.name ?? ''} · 共 ${totalShipments} 件`}
            </Typography>
          </Box>
        }
        subheader={
          <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
            近 {days} 天 · {activeDays} 天有出货 · 悬停查看详情
          </Typography>
        }
        sx={{ pb: 0.5 }}
      />

      <CardContent sx={{ pt: 0.5, pb: 1.5 }}>
        {/* 统计摘要 */}
        <Box sx={{ display: 'flex', gap: 3, mb: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: colors.level4 }} />
            <Typography sx={{ fontSize: '0.7rem', color: '#6B7280' }}>
              最高单日: {maxVal} 件
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: colors.level0 }} />
            <Typography sx={{ fontSize: '0.7rem', color: '#6B7280' }}>
              活跃: {activeDays}/{days} 天
            </Typography>
          </Box>
        </Box>

        <Box ref={containerRef} sx={{ width: '100%', height: containerHeightCalc, position: 'relative', overflowX: 'auto', overflowY: 'hidden' }}>
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${svgViewBoxWidth} ${svgViewBoxHeight}`}
            preserveAspectRatio="xMinYMin meet"
            style={{ display: 'block', minWidth: svgViewBoxWidth }}
          >
            {/* 月份标签 */}
            {weekColumns.map(col => {
              if (!col.monthLabel) return null;
              const x = WEEKDAY_LABEL_WIDTH + col.weekIndex * (cellSize + CELL_GAP);
              return (
                <text
                  key={`month-${col.weekIndex}`}
                  x={x}
                  y={14}
                  fontSize={11}
                  fontWeight={600}
                  fill="#6B7280"
                  fontFamily="-apple-system, sans-serif"
                >
                  {col.monthLabel}
                </text>
              );
            })}

            {/* 星期标签 */}
            {WEEKDAY_LABELS.map((label, i) => (
              <text
                key={`wd-${i}`}
                x={WEEKDAY_LABEL_WIDTH - 4}
                y={MONTH_LABEL_HEIGHT + i * (cellSize + CELL_GAP) + cellSize - 2}
                textAnchor="end"
                fontSize={9}
                fill="#9CA3AF"
                fontFamily="-apple-system, sans-serif"
              >
                {label}
              </text>
            ))}

            {/* 热力格子 */}
            {weekColumns.map(col => (
              <g key={`col-${col.weekIndex}`}>
                {col.days.map((cell, dayIdx) => {
                  if (!cell) return null;
                  const x = WEEKDAY_LABEL_WIDTH + col.weekIndex * (cellSize + CELL_GAP);
                  const y = MONTH_LABEL_HEIGHT + dayIdx * (cellSize + CELL_GAP);
                  const color = getColor(cell.level);
                  const isHovered = hoveredCell?.date === cell.date;

                  return (
                    <rect
                      key={cell.date}
                      x={x}
                      y={y}
                      width={cellSize}
                      height={cellSize}
                      rx={2}
                      fill={isHovered ? lightenColor(color, 30) : color}
                      stroke={isHovered ? '#111827' : 'rgba(255,255,255,0.6)'}
                      strokeWidth={isHovered ? 2 : 1}
                      style={{ cursor: 'pointer', transition: 'fill 0.12s ease, stroke 0.12s ease, strokeWidth 0.12s ease' }}
                      onMouseEnter={() => {
                        setHoveredCell(cell);
                        // 判断 tooltip 上方空间是否足够（tooltip 高度约 40px）
                        const spaceAbove = y - MONTH_LABEL_HEIGHT;
                        setTooltipPos({
                          x: x + cellSize / 2,
                          y: y,
                          showBelow: spaceAbove < 44,
                        });
                      }}
                      onMouseLeave={() => {
                        setHoveredCell(null);
                        setTooltipPos(null);
                      }}
                    />
                  );
                })}
              </g>
            ))}
            {/* SVG 内悬浮提示 — 浮动在热力格子上方/下方 */}
            {hoveredCell && tooltipPos && (() => {
              const isBelow = tooltipPos.showBelow;
              const offsetY = isBelow
                ? tooltipPos.y + cellSize + 6      // 显示在格子下方
                : tooltipPos.y - 42;               // 显示在格子上方
              return (
                <g transform={`translate(${tooltipPos.x}, ${offsetY})`}>
                  <rect
                    x={-60}
                    y={-8}
                    width={120}
                    height={34}
                    rx={6}
                    fill="#1F2937"
                  />
                  {/* 小三角箭头 */}
                  <path
                    d={isBelow
                      ? `M -4,${34} L 0,${38} L 4,${34}`
                      : `M -4,${-8} L 0,${-12} L 4,${-8}`}
                    fill="#1F2937"
                  />
                  <text x={0} y={6} textAnchor="middle" fontSize={11} fontWeight={600} fill="#FFFFFF" fontFamily="-apple-system, sans-serif">
                    {hoveredCell.display}
                  </text>
                  <text x={0} y={20} textAnchor="middle" fontSize={10} fill={hoveredCell.total > 0 ? '#9CA3AF' : '#6B7280'} fontFamily="-apple-system, sans-serif">
                    {hoveredCell.total > 0 ? `${hoveredCell.total} 件出库` : '无数据'}
                  </text>
                </g>
              );
            })()}
          </svg>
        </Box>

        {/* 图例 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>少</Typography>
          {[colors.empty, colors.level0, colors.level1, colors.level2, colors.level3, colors.level4].map((c, i) => (
            <Box
              key={c}
              sx={{
                width: 12,
                height: 12,
                borderRadius: '2px',
                backgroundColor: c,
                border: i === 0 ? '1px solid #E5E7EB' : 'none',
              }}
            />
          ))}
          <Typography sx={{ fontSize: '0.7rem', color: '#9CA3AF' }}>多</Typography>
          <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF', ml: 1 }}>
            {colorScheme === 'ocean' ? '🌊 海洋蓝' : colorScheme === 'forest' ? '🌲 森林绿' : '🌅 日落橙'}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default GitHubHeatmap;
