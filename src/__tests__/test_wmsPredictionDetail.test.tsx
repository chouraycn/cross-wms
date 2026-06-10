/**
 * WmsPredictionDetail 组件单元测试
 *
 * 测试范围：
 * - 抽屉打开/关闭
 * - SKU 和仓库 ID 显示
 * - 加载状态
 * - API 获取预测详情
 * - 错误状态
 * - 关键指标卡片（当前库存、日均消耗、归零天数、置信度）
 * - 预警消息卡片
 * - 图例说明渲染
 * - Footer 操作按钮（解决/忽略）
 * - 按钮关闭联动
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WmsPredictionDetail from '@/components/wms/WmsPredictionDetail';
import type { WmsAlert, PredictionDetail as PredictionDetailType } from '@/types/wms';

// ===================== 测试数据 =====================

const mockAlert: WmsAlert = {
  id: 100,
  warehouseId: 'WH-001',
  alertType: 'predicted_shortage',
  severity: 'high',
  sku: 'SKU-ABC',
  message: '预测 SKU-ABC 将在 5 天内消耗完毕，当前库存仅剩 25 件',
  status: 'active',
  triggeredAt: '2025-03-10T08:00:00Z',
};

const mockPredictionData: PredictionDetailType = {
  sku: 'SKU-ABC',
  warehouseId: 'WH-001',
  warehouseName: '上海仓',
  currentStock: 25,
  dailyConsumption: 5.2,
  daysUntilZero: 5,
  confidence: 'high',
  historyData: [
    { date: '2025-03-01', stock: 60, outbound: 4 },
    { date: '2025-03-02', stock: 55, outbound: 6 },
    { date: '2025-03-03', stock: 48, outbound: 7 },
    { date: '2025-03-04', stock: 42, outbound: 5 },
    { date: '2025-03-05', stock: 36, outbound: 6 },
    { date: '2025-03-06', stock: 31, outbound: 5 },
    { date: '2025-03-07', stock: 25, outbound: 6 },
  ],
  predictionCurve: [
    { date: '2025-03-08', predictedStock: 20 },
    { date: '2025-03-09', predictedStock: 15 },
    { date: '2025-03-10', predictedStock: 10 },
    { date: '2025-03-11', predictedStock: 5 },
    { date: '2025-03-12', predictedStock: 0 },
  ],
  safetyStockLine: 15,
};

// ===================== Mock fetch =====================

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

// ===================== 渲染辅助 =====================

function renderDetail(props: {
  open?: boolean;
  sku?: string;
  warehouseId?: string;
  alert?: WmsAlert;
  onResolve?: (id: number) => void;
  onIgnore?: (id: number) => void;
  onClose?: () => void;
} = {}) {
  return render(
    <WmsPredictionDetail
      open={props.open ?? true}
      onClose={props.onClose ?? vi.fn()}
      sku={props.sku ?? 'SKU-ABC'}
      warehouseId={props.warehouseId ?? 'WH-001'}
      alert={props.alert ?? mockAlert}
      onResolve={props.onResolve}
      onIgnore={props.onIgnore}
    />
  );
}

// ===================== 测试用例 =====================

describe('WmsPredictionDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ code: 0, data: mockPredictionData }),
    });
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ---------- 基础渲染 ----------

  describe('Basic Rendering', () => {
    it('should show title "SKU 预测详情"', async () => {
      renderDetail();
      await waitFor(() => {
        expect(screen.getByText('SKU 预测详情')).toBeInTheDocument();
      });
    });

    it('should show SKU and warehouse ID in subtitle', async () => {
      renderDetail();
      await waitFor(() => {
        expect(screen.getByText(/SKU-ABC/)).toBeInTheDocument();
        expect(screen.getByText(/WH-001/)).toBeInTheDocument();
      });
    });
  });

  // ---------- API 调用 ----------

  describe('API Fetching', () => {
    it('should call prediction API with correct URL params', async () => {
      renderDetail();
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/wms/alerts/prediction/SKU-ABC')
        );
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('warehouseId=WH-001')
        );
      });
    });

    it('should not fetch when drawer is closed', () => {
      renderDetail({ open: false });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not fetch when sku is empty', () => {
      renderDetail({ sku: '' });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not fetch when warehouseId is empty', () => {
      renderDetail({ warehouseId: '' });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ---------- 加载状态 ----------

  describe('Loading State', () => {
    it('should show loading spinner while fetching', async () => {
      mockFetch.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({
          json: () => Promise.resolve({ code: 0, data: mockPredictionData }),
        }), 500))
      );

      renderDetail();
      expect(screen.getByText('正在加载预测数据...')).toBeInTheDocument();

      // Cleanup
      await new Promise(r => setTimeout(r, 600));
    });
  });

  // ---------- 错误状态 ----------

  describe('Error State', () => {
    it('should show error message on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 1, message: 'SKU 不存在' }),
      });

      renderDetail();

      await waitFor(() => {
        expect(screen.getByText('SKU 不存在')).toBeInTheDocument();
      });
    });

    it('should show "网络错误" on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network Error'));

      renderDetail();

      await waitFor(() => {
        expect(screen.getByText('网络错误')).toBeInTheDocument();
      });
    });
  });

  // ---------- 指标卡片 ----------

  describe('Metric Cards', () => {
    it('should show current stock value', async () => {
      renderDetail();
      await waitFor(() => {
        expect(screen.getByText('当前库存')).toBeInTheDocument();
        expect(screen.getByText('25')).toBeInTheDocument();
      });
    });

    it('should show daily consumption with 1 decimal', async () => {
      renderDetail();
      await waitFor(() => {
        expect(screen.getByText('日均消耗 (EMA)')).toBeInTheDocument();
        expect(screen.getByText('5.2')).toBeInTheDocument();
      });
    });

    it('should show days until zero', async () => {
      renderDetail();
      await waitFor(() => {
        expect(screen.getByText('预计归零天数')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();
      });
    });

    it('should show "∞" when daysUntilZero >= 9999', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          code: 0,
          data: { ...mockPredictionData, daysUntilZero: 9999 },
        }),
      });

      renderDetail();
      await waitFor(() => {
        expect(screen.getByText('预计不归零天数')).toBeInTheDocument();
        expect(screen.getByText('∞')).toBeInTheDocument();
      });
    });

    it('should show confidence label', async () => {
      renderDetail();
      await waitFor(() => {
        expect(screen.getByText('置信度')).toBeInTheDocument();
        expect(screen.getByText('高置信度')).toBeInTheDocument();
      });
    });
  });

  // ---------- 预警消息 ----------

  describe('Alert Message Card', () => {
    it('should show alert message', async () => {
      renderDetail();
      await waitFor(() => {
        expect(screen.getByText('预警消息')).toBeInTheDocument();
        expect(screen.getByText(mockAlert.message)).toBeInTheDocument();
      });
    });
  });

  // ---------- 图例说明 ----------

  describe('Legend Section', () => {
    it('should show legend title', async () => {
      renderDetail();
      await waitFor(() => {
        expect(screen.getByText('图例说明')).toBeInTheDocument();
      });
    });

    it('should show all four legend items', async () => {
      renderDetail();
      await waitFor(() => {
        expect(screen.getByText('历史库存（蓝实线）')).toBeInTheDocument();
        expect(screen.getByText('预测库存（橙虚线）')).toBeInTheDocument();
        expect(screen.getByText('安全库存线（红虚线）')).toBeInTheDocument();
        expect(screen.getByText('预测区间（橙半透明）')).toBeInTheDocument();
      });
    });
  });

  // ---------- Footer 操作 ----------

  describe('Footer Actions', () => {
    it('should show resolve and ignore buttons when alert is active', async () => {
      const onResolve = vi.fn();
      const onIgnore = vi.fn();
      renderDetail({ onResolve, onIgnore });

      await waitFor(() => {
        expect(screen.getByText('标记已解决')).toBeInTheDocument();
        expect(screen.getByText('忽略')).toBeInTheDocument();
      });
    });

    it('should call onResolve and onClose when clicking resolve', async () => {
      const onResolve = vi.fn();
      const onClose = vi.fn();
      renderDetail({ onResolve, onClose });

      await waitFor(() => {
        expect(screen.getByText('标记已解决')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('标记已解决'));

      expect(onResolve).toHaveBeenCalledWith(100);
      expect(onClose).toHaveBeenCalled();
    });

    it('should call onIgnore and onClose when clicking ignore', async () => {
      const onIgnore = vi.fn();
      const onClose = vi.fn();
      renderDetail({ onIgnore, onClose });

      await waitFor(() => {
        expect(screen.getByText('忽略')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('忽略'));

      expect(onIgnore).toHaveBeenCalledWith(100);
      expect(onClose).toHaveBeenCalled();
    });

    it('should not show footer buttons when alert is not active', async () => {
      const resolvedAlert: WmsAlert = { ...mockAlert, status: 'resolved' };
      renderDetail({ alert: resolvedAlert });

      await waitFor(() => {
        expect(screen.queryByText('标记已解决')).not.toBeInTheDocument();
        expect(screen.queryByText('忽略')).not.toBeInTheDocument();
      });
    });

    it('should not show footer buttons when no callbacks provided', async () => {
      renderDetail({ onResolve: undefined, onIgnore: undefined });

      await waitFor(() => {
        expect(screen.queryByText('标记已解决')).not.toBeInTheDocument();
        expect(screen.queryByText('忽略')).not.toBeInTheDocument();
      });
    });

    it('should not crash when alert has no id', async () => {
      const onResolve = vi.fn();
      const onClose = vi.fn();
      const alertNoId: WmsAlert = { ...mockAlert, id: undefined };
      renderDetail({ alert: alertNoId, onResolve, onClose });

      await waitFor(() => {
        expect(screen.getByText('标记已解决')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('标记已解决'));

      // onResolve should NOT be called (no id)
      expect(onResolve).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ---------- 关闭按钮 ----------

  describe('Close Button', () => {
    it('should call onClose when X button is clicked', async () => {
      const onClose = vi.fn();
      renderDetail({ onClose });

      await waitFor(() => {
        const closeButtons = screen.getAllByRole('button');
        // First button is the close (X) icon in header
        expect(closeButtons.length).toBeGreaterThan(0);
      });

      const closeButtons = screen.getAllByRole('button');
      // X button in header
      fireEvent.click(closeButtons[0]);
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ---------- 置信度配置覆盖 ----------

  describe('Confidence Config', () => {
    it('should show "中置信度" for medium confidence', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          code: 0,
          data: { ...mockPredictionData, confidence: 'medium' },
        }),
      });

      renderDetail();

      await waitFor(() => {
        expect(screen.getByText('中置信度')).toBeInTheDocument();
      });
    });

    it('should show "低置信度" for low confidence', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          code: 0,
          data: { ...mockPredictionData, confidence: 'low' },
        }),
      });

      renderDetail();

      await waitFor(() => {
        expect(screen.getByText('低置信度')).toBeInTheDocument();
      });
    });
  });
});
