/**
 * WmsAlertList 组件单元测试
 *
 * 测试范围：
 * - 加载状态渲染
 * - 空数据渲染
 * - 预警列表分页展示
 * - 预警类型/严重程度 Chip 渲染
 * - 状态 Chip 渲染（活跃/已解决/已忽略）
 * - 解决/忽略按钮操作
 * - 活跃预警统计卡片
 * - 预测型预警行点击事件
 * - 分页控件交互
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WmsAlertList, { type WmsAlertListProps } from '@/components/wms/WmsAlertList';
import type { WmsAlert } from '@/types/wms';

// ===================== 测试数据 =====================

function createAlert(overrides: Partial<WmsAlert> = {}): WmsAlert {
  return {
    id: 1,
    warehouseId: 'WH-001',
    alertType: 'low_stock',
    severity: 'medium',
    sku: 'SKU001',
    message: '库存不足预警：当前库存仅剩 3 件',
    status: 'active',
    triggeredAt: '2025-03-15T08:00:00Z',
    ...overrides,
  };
}

const mockAlerts: WmsAlert[] = [
  createAlert({ id: 1, alertType: 'low_stock', severity: 'high', sku: 'SKU001', message: '低库存：仅剩 3 件' }),
  createAlert({ id: 2, alertType: 'expiry', severity: 'critical', sku: 'SKU002', message: '临期预警：3 天后过期' }),
  createAlert({ id: 3, alertType: 'stagnant', severity: 'medium', sku: 'SKU003', message: '呆滞预警：120天无出库' }),
  createAlert({ id: 4, alertType: 'predicted_shortage', severity: 'high', sku: 'SKU004', message: '预测 5 天后短缺' }),
  createAlert({ id: 5, alertType: 'predicted_overstock', severity: 'low', sku: 'SKU005', message: '预测 30 天后积压' }),
  createAlert({ id: 6, status: 'resolved', alertType: 'low_stock', severity: 'medium', message: '已解决' }),
  createAlert({ id: 7, status: 'ignored', alertType: 'expiry', severity: 'low', message: '已忽略' }),
];

// ===================== 渲染辅助 =====================

function renderAlertList(props: Partial<WmsAlertListProps> = {}) {
  const defaultProps: WmsAlertListProps = {
    alerts: mockAlerts,
    loading: false,
    onResolve: vi.fn(),
    onIgnore: vi.fn(),
    ...props,
  };
  return render(<WmsAlertList {...defaultProps} />);
}

// ===================== 测试用例 =====================

describe('WmsAlertList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------- 加载状态 ----------

  describe('Loading State', () => {
    it('should show loading text when loading is true', () => {
      renderAlertList({ loading: true });
      expect(screen.getByText('正在加载预警数据...')).toBeInTheDocument();
    });

    it('should not show the table when loading', () => {
      renderAlertList({ loading: true });
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('should show the table when loading is false', () => {
      renderAlertList({ loading: false });
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  // ---------- 空数据 ----------

  describe('Empty State', () => {
    it('should show empty message when alerts array is empty', () => {
      renderAlertList({ alerts: [] });
      expect(screen.getByText('暂无预警数据')).toBeInTheDocument();
    });

    it('should not render active count card when no alerts', () => {
      renderAlertList({ alerts: [] });
      expect(screen.queryByText(/条活跃预警/)).not.toBeInTheDocument();
    });
  });

  // ---------- 活跃预警统计卡片 ----------

  describe('Active Alert Count Card', () => {
    it('should show active alert count when there are active alerts', () => {
      renderAlertList();
      expect(screen.getByText(/当前.*条活跃预警/)).toBeInTheDocument();
    });

    it('should show correct active count (5 active out of 7 total)', () => {
      renderAlertList();
      expect(screen.getByText(/当前 5 条活跃预警/)).toBeInTheDocument();
    });

    it('should not show active count card when no active alerts', () => {
      const allResolved = [
        createAlert({ id: 1, status: 'resolved' }),
        createAlert({ id: 2, status: 'ignored' }),
      ];
      renderAlertList({ alerts: allResolved });
      expect(screen.queryByText(/条活跃预警/)).not.toBeInTheDocument();
    });
  });

  // ---------- 表格列头 ----------

  describe('Table Headers', () => {
    it('should render all eight column headers', () => {
      renderAlertList();
      expect(screen.getByText('ID')).toBeInTheDocument();
      expect(screen.getByText('仓库ID')).toBeInTheDocument();
      expect(screen.getByText('预警类型')).toBeInTheDocument();
      expect(screen.getByText('严重程度')).toBeInTheDocument();
      expect(screen.getByText('SKU')).toBeInTheDocument();
      expect(screen.getByText('消息')).toBeInTheDocument();
      expect(screen.getByText('触发时间')).toBeInTheDocument();
      expect(screen.getByText('状态')).toBeInTheDocument();
      expect(screen.getByText('操作')).toBeInTheDocument();
    });
  });

  // ---------- 预警类型 Chip 标签 ----------

  describe('Alert Type Chips', () => {
    it('should render 低库存 chip for low_stock alerts', () => {
      renderAlertList();
      const chips = screen.getAllByText('低库存');
      expect(chips.length).toBeGreaterThanOrEqual(1);
    });

    it('should render 临期 chip for expiry alerts', () => {
      renderAlertList();
      const chips = screen.getAllByText('临期');
      expect(chips.length).toBeGreaterThanOrEqual(1);
    });

    it('should render 滞销 chip for stagnant alerts', () => {
      renderAlertList();
      expect(screen.getByText('滞销')).toBeInTheDocument();
    });

    it('should render 预测短缺 chip for predicted_shortage alerts', () => {
      renderAlertList();
      expect(screen.getByText('预测短缺')).toBeInTheDocument();
    });

    it('should render 预测积压 chip for predicted_overstock alerts', () => {
      renderAlertList();
      expect(screen.getByText('预测积压')).toBeInTheDocument();
    });
  });

  // ---------- 严重程度 Chip 标签 ----------

  describe('Severity Chips', () => {
    it('should render all severity labels in Chinese', () => {
      renderAlertList();
      const lowSev = screen.getAllByText('低');
      expect(lowSev.length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('中').length).toBeGreaterThan(0);
      expect(screen.getAllByText('高').length).toBeGreaterThan(0);
      expect(screen.getByText('紧急')).toBeInTheDocument();
    });
  });

  // ---------- 状态 Chip 渲染 ----------

  describe('Status Chips', () => {
    it('should show 活跃 label for active status', () => {
      renderAlertList();
      const activeLabels = screen.getAllByText('活跃');
      expect(activeLabels.length).toBeGreaterThanOrEqual(1);
    });

    it('should show 已解决 label for resolved status', () => {
      renderAlertList();
      const resolved = screen.getAllByText('已解决');
      expect(resolved.length).toBeGreaterThanOrEqual(1);
    });

    it('should show 已忽略 label for ignored status', () => {
      renderAlertList();
      const ignored = screen.getAllByText('已忽略');
      expect(ignored.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------- 操作按钮 ----------

  describe('Action Buttons', () => {
    it('should call onResolve when clicking resolve button', () => {
      const onResolve = vi.fn();
      renderAlertList({ onResolve });

      // 第一个活跃预警的解决按钮
      const resolveButtons = screen.getAllByLabelText('标记已解决');
      expect(resolveButtons.length).toBeGreaterThan(0);
      fireEvent.click(resolveButtons[0]);

      expect(onResolve).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should call onIgnore when clicking ignore button', () => {
      const onIgnore = vi.fn();
      renderAlertList({ onIgnore });

      const ignoreButtons = screen.getAllByLabelText('忽略');
      expect(ignoreButtons.length).toBeGreaterThan(0);
      fireEvent.click(ignoreButtons[0]);

      expect(onIgnore).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should not show action buttons for resolved alerts', () => {
      const resolvedOnly = [createAlert({ id: 1, status: 'resolved' })];
      renderAlertList({ alerts: resolvedOnly });

      expect(screen.queryByLabelText('标记已解决')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('忽略')).not.toBeInTheDocument();
    });

    it('should not show action buttons for ignored alerts', () => {
      const ignoredOnly = [createAlert({ id: 1, status: 'ignored' })];
      renderAlertList({ alerts: ignoredOnly });

      expect(screen.queryByLabelText('标记已解决')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('忽略')).not.toBeInTheDocument();
    });

    it('should not call onResolve if alert has no id', () => {
      const onResolve = vi.fn();
      const alertNoId = createAlert({ id: undefined, status: 'active' });
      renderAlertList({ alerts: [alertNoId], onResolve });

      const resolveButtons = screen.getAllByLabelText('标记已解决');
      fireEvent.click(resolveButtons[0]);

      expect(onResolve).not.toHaveBeenCalled();
    });
  });

  // ---------- 预测型预警点击 ----------

  describe('Prediction Alert Row Click', () => {
    it('should call onPredictionDetail when clicking a prediction alert row', () => {
      const onPredictionDetail = vi.fn();
      renderAlertList({ onPredictionDetail });

      // 点击 predicted_shortage 行触发的 SKU="SKU004" 行
      const predictedRows = screen.getAllByText('预测短缺');
      // 找到父级 TableRow 并点击
      const row = predictedRows[0].closest('tr');
      if (row) {
        fireEvent.click(row);
      }

      expect(onPredictionDetail).toHaveBeenCalledWith(
        expect.objectContaining({ alertType: 'predicted_shortage' })
      );
    });

    it('should not call onPredictionDetail when onPredictionDetail is not provided', () => {
      renderAlertList({ onPredictionDetail: undefined });

      const predictedChips = screen.getAllByText('预测短缺');
      const row = predictedChips[0].closest('tr');
      if (row) {
        fireEvent.click(row);
      }

      // 不应报错，只是不调用
    });

    it('should not trigger onPredictionDetail for non-prediction alert rows', () => {
      const onPredictionDetail = vi.fn();
      renderAlertList({ onPredictionDetail });

      const lowStockRows = screen.getAllByText('低库存');
      const lowStockRow = lowStockRows[0].closest('tr');
      if (lowStockRow) {
        fireEvent.click(lowStockRow);
      }

      expect(onPredictionDetail).not.toHaveBeenCalled();
    });
  });

  // ---------- 分页 ----------

  describe('Pagination', () => {
    it('should render pagination when alerts exceed rowsPerPage', () => {
      const manyAlerts = Array.from({ length: 25 }, (_, i) =>
        createAlert({ id: i + 1, sku: `SKU${String(i + 1).padStart(3, '0')}`, status: i < 20 ? 'active' : 'resolved' })
      );
      renderAlertList({ alerts: manyAlerts });

      // 应显示分页信息
      expect(screen.getByText(/共 25 条/)).toBeInTheDocument();
    });

    it('should show row count label correctly', () => {
      renderAlertList();
      const total = mockAlerts.length;
      expect(screen.getByText(new RegExp(`共 ${total} 条`))).toBeInTheDocument();
    });

    it('should default to 20 rows per page', () => {
      renderAlertList();
      // 验证显示的行数不超过 20
      const rows = screen.getAllByRole('row');
      // header + body rows — 7 total alerts, all display on first page
      expect(rows.length).toBe(mockAlerts.length + 1);
    });
  });

  // ---------- 格式化日期 ----------

  describe('Date Formatting', () => {
    it('should display formatted date for triggeredAt', () => {
      renderAlertList();
      // 2025-03-15T08:00:00Z formatted as zh-CN locale — should NOT show raw timestamp
      expect(screen.queryByText('2025-03-15T08:00:00Z')).not.toBeInTheDocument();
    });

    it('should display "-" when triggeredAt is undefined', () => {
      const alertsWithoutDate = [createAlert({ id: 1, triggeredAt: undefined })];
      renderAlertList({ alerts: alertsWithoutDate });
      const dashes = screen.getAllByText('-');
      expect(dashes.length).toBeGreaterThan(0);
    });

    it('should display "-" when triggeredAt is an empty string', () => {
      const alertsWithEmptyDate = [createAlert({ id: 1, triggeredAt: '' })];
      renderAlertList({ alerts: alertsWithEmptyDate });
      const dashes = screen.getAllByText('-');
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  // ---------- SKU 回退显示 ----------

  describe('SKU Fallback Display', () => {
    it('should display "-" when sku is undefined', () => {
      const alertNoSku = createAlert({ id: 1, sku: undefined });
      renderAlertList({ alerts: [alertNoSku] });
      const dashes = screen.getAllByText('-');
      expect(dashes.length).toBeGreaterThan(0);
    });

    it('should display "-" when sku is empty string', () => {
      const alertEmptySku = createAlert({ id: 1, sku: '' });
      renderAlertList({ alerts: [alertEmptySku] });
      const dashes = screen.getAllByText('-');
      expect(dashes.length).toBeGreaterThan(0);
    });
  });
});
