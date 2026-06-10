/**
 * WmsPredictionDashboard 组件单元测试
 *
 * 测试范围：
 * - 加载状态（loading=true）
 * - 空数据状态（data=null）
 * - 4 张统计卡片渲染
 * - 折叠/展开交互
 * - AI 预测检查按钮
 * - checking 状态（按钮禁用+加载动画）
 * - localStorage 持久化（折叠状态）
 * - 数据覆盖率格式显示（百分比）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import WmsPredictionDashboard, { type WmsPredictionDashboardProps } from '@/components/wms/WmsPredictionDashboard';
import type { PredictionDashboardData } from '@/types/wms';

// ===================== Mock localStorage =====================

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// ===================== 测试数据 =====================

const mockData: PredictionDashboardData = {
  predictedShortageCount: 3,
  predictedOverstockCount: 5,
  pendingReplenishSkuCount: 12,
  dataCoverageRate: 78,
};

// ===================== 渲染辅助 =====================

function renderDashboard(props: Partial<WmsPredictionDashboardProps> = {}) {
  const defaultProps: WmsPredictionDashboardProps = {
    data: mockData,
    loading: false,
    onCheckPrediction: vi.fn().mockResolvedValue(undefined),
    checking: false,
    ...props,
  };
  return render(<WmsPredictionDashboard {...defaultProps} />);
}

// ===================== 测试用例 =====================

describe('WmsPredictionDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  // ---------- 加载状态 ----------

  describe('Loading State', () => {
    it('should show loading spinner when loading is true', () => {
      renderDashboard({ loading: true });
      expect(screen.getByText('加载预测数据...')).toBeInTheDocument();
    });

    it('should show loading when loading is true regardless of data', () => {
      renderDashboard({ loading: true, data: mockData });
      expect(screen.getByText('加载预测数据...')).toBeInTheDocument();
    });
  });

  // ---------- 空数据状态 ----------

  describe('Empty State', () => {
    it('should show prompt to run prediction when data is null', () => {
      renderDashboard({ data: null });
      expect(screen.getByText(/暂无预测数据/)).toBeInTheDocument();
      const aiButtons = screen.getAllByText(/AI 预测检查/);
      expect(aiButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('should not show stat cards when data is null', () => {
      renderDashboard({ data: null });
      expect(screen.queryByText('预测短缺')).not.toBeInTheDocument();
      expect(screen.queryByText('预测积压')).not.toBeInTheDocument();
    });
  });

  // ---------- 数据卡片渲染 ----------

  describe('Data Cards', () => {
    it('should show predictedShortageCount value', () => {
      renderDashboard();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should show predictedOverstockCount value', () => {
      renderDashboard();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should show pendingReplenishSkuCount value', () => {
      renderDashboard();
      expect(screen.getByText('12')).toBeInTheDocument();
    });

    it('should show dataCoverageRate with percent sign', () => {
      renderDashboard();
      expect(screen.getByText('78%')).toBeInTheDocument();
    });

    it('should render 4 card labels', () => {
      renderDashboard();
      expect(screen.getByText('预测短缺')).toBeInTheDocument();
      expect(screen.getByText('预测积压')).toBeInTheDocument();
      expect(screen.getByText('待补货 SKU')).toBeInTheDocument();
      expect(screen.getByText('数据覆盖率')).toBeInTheDocument();
    });
  });

  // ---------- 折叠/展开 ----------

  describe('Collapse Behavior', () => {
    it('should start expanded by default (content visible)', () => {
      renderDashboard();
      expect(screen.getByText('预测短缺')).toBeInTheDocument();
    });

    it('should collapse content when header is clicked', async () => {
      renderDashboard();

      // 点击 header 区域折叠
      const header = screen.getByText('智能预测看板');
      await act(async () => {
        fireEvent.click(header);
      });

      // After collapse, MUI Collapse uses CSS transition + hidden state
      // Wait for transition to complete
      await waitFor(() => {
        const collapseRoot = document.querySelector('.MuiCollapse-root');
        expect(collapseRoot).not.toBeNull();
        if (collapseRoot) {
          const style = window.getComputedStyle(collapseRoot);
          // Collapse hides content by setting visibility to hidden
          expect(style.visibility).toBe('hidden');
        }
      });
    });

    it('should persist collapse state to localStorage', async () => {
      renderDashboard();

      const header = screen.getByText('智能预测看板');
      await act(async () => {
        fireEvent.click(header);
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'wms-prediction-dashboard-collapsed',
        'true'
      );
    });

    it('should read initial collapsed state from localStorage', async () => {
      localStorageMock.getItem.mockReturnValueOnce('true');
      renderDashboard();

      // Should start collapsed
      await waitFor(() => {
        const collapseRoot = document.querySelector('.MuiCollapse-root');
        expect(collapseRoot).not.toBeNull();
        if (collapseRoot) {
          const style = window.getComputedStyle(collapseRoot);
          expect(style.visibility).toBe('hidden');
        }
      });
    });
  });

  // ---------- AI 预测检查按钮 ----------

  describe('AI Prediction Button', () => {
    it('should render "AI 预测检查" button', () => {
      renderDashboard();
      expect(screen.getByText('AI 预测检查')).toBeInTheDocument();
    });

    it('should call onCheckPrediction when button is clicked', async () => {
      const onCheckPrediction = vi.fn().mockResolvedValue(undefined);
      renderDashboard({ onCheckPrediction });

      const btn = screen.getByText('AI 预测检查');
      await act(async () => {
        fireEvent.click(btn);
      });

      expect(onCheckPrediction).toHaveBeenCalledTimes(1);
    });

    it('should show "预测中..." text when checking is true', () => {
      renderDashboard({ checking: true });
      expect(screen.getByText('预测中...')).toBeInTheDocument();
      expect(screen.queryByText('AI 预测检查')).not.toBeInTheDocument();
    });

    it('should disable button when checking is true', () => {
      renderDashboard({ checking: true });
      const btn = screen.getByText('预测中...');
      expect(btn.closest('button')).toBeDisabled();
    });

    it('should not close dashboard when clicking AI button (stop propagation)', async () => {
      const onCheckPrediction = vi.fn().mockResolvedValue(undefined);
      renderDashboard({ onCheckPrediction });

      // Click should NOT trigger collapse
      const btn = screen.getByText('AI 预测检查');
      await act(async () => {
        fireEvent.click(btn);
      });

      // Content should still be visible
      expect(screen.getByText('预测短缺')).toBeInTheDocument();
    });
  });

  // ---------- 边界情况 ----------

  describe('Edge Cases', () => {
    it('should show zero values correctly', () => {
      const zeroData: PredictionDashboardData = {
        predictedShortageCount: 0,
        predictedOverstockCount: 0,
        pendingReplenishSkuCount: 0,
        dataCoverageRate: 0,
      };
      renderDashboard({ data: zeroData });

      expect(screen.getByText('0%')).toBeInTheDocument();
      // All counts are 0
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle 100% data coverage rate', () => {
      const fullData: PredictionDashboardData = {
        predictedShortageCount: 0,
        predictedOverstockCount: 0,
        pendingReplenishSkuCount: 0,
        dataCoverageRate: 100,
      };
      renderDashboard({ data: fullData });
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('should handle async onCheckPrediction rejection gracefully', async () => {
      const onCheckPrediction = vi.fn().mockRejectedValue(new Error('API Error'));
      renderDashboard({ onCheckPrediction });

      const btn = screen.getByText('AI 预测检查');
      await act(async () => {
        fireEvent.click(btn);
      });

      // Button should still work; no crash
      expect(onCheckPrediction).toHaveBeenCalled();
    });
  });
});
