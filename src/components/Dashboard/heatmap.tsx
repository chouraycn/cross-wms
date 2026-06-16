import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Box, Typography, Card, CardHeader, CardContent, CircularProgress, Alert, Paper, useTheme } from '@mui/material';
import { getGrayScale } from '../../constants/theme';
import { useDashboardSettings } from '../../contexts/AppSettingsContext';
import { ALL_WAREHOUSES } from './WarehouseSelector';
import { useWarehouseCapability } from '../../capabilities/warehouse';
import type { Warehouse, InboundRecord, OutboundRecord } from '../../types';
import type { TimeRange } from './TimeRangeSelector';
import dayjs from 'dayjs';

/**
 * 仓库出货日历热力图
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
function generateCalendarData(
  days: number,
  warehouses: Warehouse[],
  targetWhId: string,
  inboundRecords: InboundRecord[],
  outboundRecords: OutboundRecord[]
) {
  const whList = targetWhId === ALL_WAREHOUSES
    ? warehouses
    : warehouses.filter(w => w.id === targetWhId);

  const today = dayjs().endOf('day');
  // 减少一天：实际使用 days-1 天，确保显示天数比设置少一天
  const actualDays = days - 1;
  const startDate = today.subtract(actualDays - 1, 'day').startOf('day');

  // 初始化每日数据
  const dayMap: Record<string, number> = {};
  for (let i = 0; i < actualDays; i++) {
    const d = startDate.add(i, 'day');
    dayMap[d.format('YYYY-MM-DD')] = 0;
  }

  // 聚合入库记录
  const addRecord = (dateStr: string, qty: number) => {
    const mapped = mapToCurrentYear(dateStr);
    if (mapped && mapped in dayMap) {
      dayMap[mapped] += qty;
    }
  };

  inboundRecords.forEach(r => {
    if (targetWhId !== ALL_WAREHOUSES && r.warehouseId !== targetWhId) return;
    if (targetWhId === ALL_WAREHOUSES && !whList.find(w => w.id === r.warehouseId)) return;
    addRecord(r.createdAt, r.quantity);
  });
  outboundRecords.forEach(r => {
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

interface HeatmapProps {
  warehouseId: string;
  timeRange?: TimeRange;
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const CELL_GAP = 3;           // 格子间距 3px
const WEEKDAY_LABEL_WIDTH = 36; // 左侧星期标签宽 36px
const MONTH_LABEL_HEIGHT = 20;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Heatmap: React.FC<HeatmapProps> = ({ warehouseId, timeRange }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);

  const { settings } = useDashboardSettings();
  const heatmapSettings = settings.heatmap;
  const days = heatmapSettings?.days ?? 90;
  const colorScheme = (heatmapSettings?.colorScheme as ColorScheme) ?? 'ocean';
  const colors = COLOR_SCHEMES[colorScheme] || OCEAN;

  // 从 Context 获取数据
  const { warehouses, inboundRecords, outboundRecords, loading, error } = useWarehouseCapability({ includeDashboard: true });

  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredCell, setHoveredCell] = useState<DayCell | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleCellMouseEnter = useCallback((cell: DayCell, event: React.MouseEvent) => {
    setHoveredCell(cell);
    const rect = (event.currentTarget as SVGRectElement).getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (containerRect) {
      setTooltipPos({
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top - 8,
      });
    }
  }, []);

  const handleCellMouseLeave = useCallback(() => {
    setHoveredCell(null);
  }, []);

  const { cells, maxVal, whCount } = useMemo(
    () => generateCalendarData(days, warehouses, warehouseId, inboundRecords, outboundRecords),
    [days, warehouses, warehouseId, inboundRecords, outboundRecords]
  );

  // 所有 hooks 必须在条件返回之前调用（React Hooks 规则）
  const weekColumns = useMemo(() => buildWeekColumns(cells), [cells]);
  const cellSize = 14;
  const totalShipments = useMemo(() => cells.reduce((s, c) => s + c.total, 0), [cells]);
  const activeDays = useMemo(() => cells.filter(c => c.total > 0).length, [cells]);

  // SVG viewBox 尺寸 — 精确计算内容宽度，避免右侧多余留白
  const svgViewBoxWidth = useMemo(() => {
    const lastCol = weekColumns[weekColumns.length - 1];
    const maxWeekIdx = lastCol ? lastCol.weekIndex : 0;
    return WEEKDAY_LABEL_WIDTH + (maxWeekIdx + 1) * cellSize + maxWeekIdx * CELL_GAP;
  }, [weekColumns, cellSize]);
  const svgViewBoxHeight = MONTH_LABEL_HEIGHT + 7 * (cellSize + CELL_GAP);
  const containerHeightCalc = useMemo(() => `${svgViewBoxHeight + 24}px`, [svgViewBoxHeight]);

  // 加载状态
  if (loading) {
    return (
      <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2 }}>
        <CardContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
          <CircularProgress size={30} sx={{ color: gs.textPrimary }} />
        </CardContent>
      </Card>
    );
  }

  // 错误状态
  if (error) {
    return (
      <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2 }}>
        <CardContent>
          <Alert severity="error">{error}</Alert>
        </CardContent>
      </Card>
    );
  }

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
  if (warehouses.length === 0) {
    return (
      <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2 }}>
        <CardHeader
          title={
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: gs.textPrimary }}>
              出货日历热力图
            </Typography>
          }
          subheader={
            <Typography sx={{ fontSize: '0.75rem', color: gs.textDisabled }}>
              近 {days} 天 · GitHub 风格
            </Typography>
          }
        />
        <CardContent>
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.875rem', color: gs.textDisabled, mb: 1 }}>
              暂无仓库数据，请先添加仓库
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: gs.borderDarker }}>
              热力图将展示每日出货趋势
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card elevation={0} sx={{ border: `1px solid ${gs.border}`, borderRadius: 2 }}>
      <CardHeader
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: gs.textPrimary }}>
              出货日历热力图
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: gs.textDisabled }}>
              {warehouseId === ALL_WAREHOUSES
                ? `全部 ${whCount} 个仓库 · 共 ${totalShipments} 件`
                : `${warehouses.find(w => w.id === warehouseId)?.name ?? ''} · 共 ${totalShipments} 件`}
            </Typography>
          </Box>
        }
        subheader={
          <Typography sx={{ fontSize: '0.75rem', color: gs.textDisabled }}>
            近 {days} 天 · {activeDays} 天有出货
          </Typography>
        }
        sx={{ pb: 0.5 }}
      />

      <CardContent sx={{ pt: 0.5, pb: 1.5 }}>
        {/* 统计摘要 */}
        <Box sx={{ display: 'flex', gap: 3, mb: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: colors.level4 }} />
            <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>
              最高单日: {maxVal} 件
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: colors.level0 }} />
            <Typography sx={{ fontSize: '0.7rem', color: gs.textMuted }}>
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
                  fill={gs.textMuted}
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
                fill={gs.textDisabled}
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

                  return (
                    <rect
                      key={cell.date}
                      x={x}
                      y={y}
                      width={cellSize}
                      height={cellSize}
                      rx={2}
                      fill={color}
                      stroke="rgba(255,255,255,0.6)"
                      strokeWidth={1}
                      onMouseEnter={(e) => handleCellMouseEnter(cell, e)}
                      onMouseLeave={handleCellMouseLeave}
                      style={{ cursor: 'pointer' }}
                    />
                  );
                })}
              </g>
            ))}
          </svg>

          {/* 悬停 Tooltip */}
          {hoveredCell && (
            <Paper
              elevation={3}
              sx={{
                position: 'absolute',
                left: tooltipPos.x,
                top: tooltipPos.y,
                transform: 'translate(-50%, -100%)',
                px: 1.5,
                py: 0.75,
                borderRadius: 1,
                bgcolor: gs.textPrimary,
                color: gs.bgPanel,
                fontSize: '0.75rem',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 9999,
              }}
            >
              <Typography sx={{ fontSize: '0.75rem', color: gs.bgPanel, lineHeight: 1.4 }}>
                {hoveredCell.display}：{hoveredCell.total} 件
              </Typography>
            </Paper>
          )}
        </Box>

        {/* 图例 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: '0.7rem', color: gs.textDisabled }}>少</Typography>
          {[colors.empty, colors.level0, colors.level1, colors.level2, colors.level3, colors.level4].map((c, i) => (
            <Box
              key={c}
              sx={{
                width: 12,
                height: 12,
                borderRadius: '2px',
                backgroundColor: c,
                border: i === 0 ? `1px solid ${gs.border}` : 'none',
              }}
            />
          ))}
          <Typography sx={{ fontSize: '0.7rem', color: gs.textDisabled }}>多</Typography>
          <Typography sx={{ fontSize: '0.65rem', color: gs.textDisabled, ml: 1 }}>
            {colorScheme === 'ocean' ? '🌊 海洋蓝' : colorScheme === 'forest' ? '🌲 森林绿' : '🌅 日落橙'}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default Heatmap;
