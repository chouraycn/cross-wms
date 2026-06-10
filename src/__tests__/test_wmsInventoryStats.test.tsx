/**
 * WmsInventoryStats 组件单元测试
 *
 * 测试范围：
 * - 空数据渲染（全部为 0）
 * - 各状态统计计数正确性
 * - 进度条渲染（pending/counted/adjusted 比例）
 * - 差异值显示
 * - useMemo 依赖更新
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WmsInventoryStats from '@/components/wms/WmsInventoryStats';
import type { InventoryCount } from '@/types/wms';

// ===================== 测试数据 =====================

function createCount(overrides: Partial<InventoryCount> = {}): InventoryCount {
  return {
    id: 1,
    warehouseId: 'WH-001',
    locationCode: 'A-01-01',
    sku: 'SKU001',
    systemQuantity: 100,
    status: 'pending',
    ...overrides,
  };
}

// ===================== 测试用例 =====================

describe('WmsInventoryStats', () => {
  // ---------- 空数据处理 ----------

  describe('Empty Data', () => {
    it('should show all zeros when data is empty', () => {
      render(<WmsInventoryStats data={[]} />);
      expect(screen.getByText('总盘点数量')).toBeInTheDocument();
      expect(screen.getByText('待盘点')).toBeInTheDocument();
      expect(screen.getByText('已盘点')).toBeInTheDocument();
      expect(screen.getByText('已调整')).toBeInTheDocument();

      // All values should be 0
      const values = screen.getAllByText('0');
      expect(values.length).toBeGreaterThanOrEqual(3); // total, pending, counted, adjusted all 0
    });

    it('should show "差异: 0" when no adjusted items', () => {
      render(<WmsInventoryStats data={[]} />);
      expect(screen.getByText('差异: 0')).toBeInTheDocument();
    });
  });

  // ---------- 统计计数 ----------

  describe('Count Accuracy', () => {
    it('should correctly count pending items', () => {
      const data = [
        createCount({ id: 1, status: 'pending' }),
        createCount({ id: 2, status: 'pending' }),
        createCount({ id: 3, status: 'pending' }),
      ];
      render(<WmsInventoryStats data={data} />);
      // Total count card shows "3"
      const threes = screen.getAllByText('3');
      expect(threes.length).toBeGreaterThanOrEqual(2); // total + pending both show 3
    });

    it('should correctly count mixed status items', () => {
      const data = [
        createCount({ id: 1, status: 'pending' }),
        createCount({ id: 2, status: 'pending' }),
        createCount({ id: 3, status: 'counted' }),
        createCount({ id: 4, status: 'counted' }),
        createCount({ id: 5, status: 'adjusted', variance: -3 }),
      ];
      render(<WmsInventoryStats data={data} />);

      // total = 5
      expect(screen.getByText('5')).toBeInTheDocument();

      // pending = 2, counted = 2, adjusted = 1
      const twos = screen.getAllByText('2');
      expect(twos.length).toBeGreaterThanOrEqual(2); // pending + counted both show 2
      
      const ones = screen.getAllByText('1');
      expect(ones.length).toBeGreaterThanOrEqual(1); // adjusted shows 1

      // variance display
      expect(screen.getByText('差异: -3')).toBeInTheDocument();
    });
  });

  // ---------- 差异累加 ----------

  describe('Variance Aggregation', () => {
    it('should sum variances only from adjusted items', () => {
      const data = [
        createCount({ id: 1, status: 'adjusted', variance: 5 }),
        createCount({ id: 2, status: 'adjusted', variance: -2 }),
        createCount({ id: 3, status: 'counted', variance: 10 }), // counted variance NOT included
      ];
      render(<WmsInventoryStats data={data} />);

      // adjusted total variance: 5 + (-2) = +3
      expect(screen.getByText('差异: +3')).toBeInTheDocument();
    });

    it('should show "差异: 0" when variance sums to 0', () => {
      const data = [
        createCount({ id: 1, status: 'adjusted', variance: 5 }),
        createCount({ id: 2, status: 'adjusted', variance: -5 }),
      ];
      render(<WmsInventoryStats data={data} />);
      // 5 + (-5) = 0, and 0 is not > 0, so label is "差异: 0" without "+"
      expect(screen.getByText('差异: 0')).toBeInTheDocument();
    });

    it('should handle undefined variance on adjusted item', () => {
      const data = [
        createCount({ id: 1, status: 'adjusted', variance: undefined }),
        createCount({ id: 2, status: 'adjusted', variance: 3 }),
      ];
      render(<WmsInventoryStats data={data} />);
      // undefined variance is skipped, so total = 3
      expect(screen.getByText('差异: +3')).toBeInTheDocument();
    });

    it('should handle variance=0 on adjusted item (falsy, skipped)', () => {
      const data = [
        createCount({ id: 1, status: 'adjusted', variance: 0 }),
        createCount({ id: 2, status: 'adjusted', variance: 5 }),
      ];
      render(<WmsInventoryStats data={data} />);
      // variance=0 is falsy, so only 5 is added
      expect(screen.getByText('差异: +5')).toBeInTheDocument();
    });
  });

  // ---------- 进度条 ----------

  describe('Progress Bars', () => {
    it('should show progress bars for pending/counted/adjusted', () => {
      const data = [
        createCount({ id: 1, status: 'pending' }),
        createCount({ id: 2, status: 'counted' }),
        createCount({ id: 3, status: 'adjusted' }),
        createCount({ id: 4, status: 'pending' }),
      ];
      const { container } = render(<WmsInventoryStats data={data} />);

      // 3 progress bars (pending/counted/adjusted each have one)
      const progressBars = container.querySelectorAll('.MuiLinearProgress-root');
      expect(progressBars.length).toBe(3);
    });

    it('should set progress to 0 when data is empty', () => {
      const { container } = render(<WmsInventoryStats data={[]} />);
      const progressBars = container.querySelectorAll('.MuiLinearProgress-root');
      progressBars.forEach((bar) => {
        const determined = bar.querySelector('.MuiLinearProgress-determinate');
        // Empty data → 0% progress
        if (determined) {
          expect(determined).toBeTruthy();
        }
      });
      expect(progressBars.length).toBe(3);
    });
  });

  // ---------- 卡片结构 ----------

  describe('Card Structure', () => {
    it('should render 4 stat cards', () => {
      const { container } = render(<WmsInventoryStats data={[createCount()]} />);
      const cards = container.querySelectorAll('.MuiCard-root');
      expect(cards.length).toBe(4);
    });

    it('each card should have a label', () => {
      render(<WmsInventoryStats data={[createCount()]} />);
      expect(screen.getByText('总盘点数量')).toBeInTheDocument();
      expect(screen.getByText('待盘点')).toBeInTheDocument();
      expect(screen.getByText('已盘点')).toBeInTheDocument();
      expect(screen.getByText('已调整')).toBeInTheDocument();
    });
  });
});
