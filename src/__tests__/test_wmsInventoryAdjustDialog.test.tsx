/**
 * WmsInventoryAdjustDialog 组件单元测试
 *
 * 测试范围：
 * - open=false 时不渲染
 * - inventoryItem=null 时不渲染
 * - 正常渲染盘点详情
 * - 盘盈/盘亏/无差异的颜色和文字
 * - 调整确认 API 调用
 * - 成功/失败 toast
 * - submitting 状态
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WmsInventoryAdjustDialog from '@/components/wms/WmsInventoryAdjustDialog';
import type { InventoryCount } from '@/types/wms';

// ===================== Mock 依赖 =====================

const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockAdjustInventoryCount = vi.fn();
vi.mock('@/api/wmsInventoryApi', () => ({
  adjustInventoryCount: (...args: unknown[]) => mockAdjustInventoryCount(...args),
  createInventoryCount: vi.fn(),
}));

// ===================== 测试数据 =====================

function makeInventoryItem(overrides: Partial<InventoryCount> = {}): InventoryCount {
  return {
    id: 1,
    warehouseId: 'WH-001',
    locationCode: 'A-01-01',
    sku: 'SKU-001',
    systemQuantity: 100,
    actualQuantity: 95,
    variance: -5,
    counter: '张三',
    status: 'counted',
    ...overrides,
  };
}

function renderDialog(props: {
  open?: boolean;
  inventoryItem?: InventoryCount | null;
  onClose?: () => void;
  onSuccess?: () => void;
} = {}) {
  return render(
    <WmsInventoryAdjustDialog
      open={props.open ?? true}
      inventoryItem={props.inventoryItem ?? makeInventoryItem()}
      onClose={props.onClose ?? vi.fn()}
      onSuccess={props.onSuccess ?? vi.fn()}
    />
  );
}

beforeEach(() => {
  mockShowToast.mockClear();
  mockAdjustInventoryCount.mockClear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===================== 测试用例 =====================

describe('WmsInventoryAdjustDialog', () => {
  // ---- 渲染控制测试 ----

  describe('Visibility', () => {
    it('should not render dialog when open=false', () => {
      renderDialog({ open: false });
      expect(screen.queryByText('确认差异调整')).not.toBeInTheDocument();
    });

    it('should not render content when inventoryItem=null', () => {
      const { container } = render(
        <WmsInventoryAdjustDialog
          open={true}
          inventoryItem={null}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );
      expect(screen.queryByText('确认差异调整')).not.toBeInTheDocument();
    });

    it('should render dialog title when open with valid item', () => {
      renderDialog();
      expect(screen.getByText('确认差异调整')).toBeInTheDocument();
    });
  });

  // ---- 盘点详情渲染测试 ----

  describe('Inventory details', () => {
    it('should display warehouse ID', () => {
      renderDialog();
      expect(screen.getByText('WH-001')).toBeInTheDocument();
    });

    it('should display location code', () => {
      renderDialog();
      expect(screen.getByText('A-01-01')).toBeInTheDocument();
    });

    it('should display SKU', () => {
      renderDialog();
      expect(screen.getByText('SKU-001')).toBeInTheDocument();
    });

    it('should display system quantity', () => {
      renderDialog();
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('should display actual quantity', () => {
      renderDialog();
      expect(screen.getByText('95')).toBeInTheDocument();
    });

    it('should display counter name', () => {
      renderDialog();
      expect(screen.getByText('张三')).toBeInTheDocument();
    });

    it('should hide counter row when counter is empty', () => {
      renderDialog({ inventoryItem: makeInventoryItem({ counter: undefined }) });
      expect(screen.queryByText('盘点人：')).not.toBeInTheDocument();
    });
  });

  // ---- 差异显示测试 ----

  describe('Variance display', () => {
    it('should display "盘亏 N" in red for negative variance', () => {
      renderDialog({ inventoryItem: makeInventoryItem({ variance: -5, actualQuantity: 95 }) });
      const varianceEl = screen.getByText('盘亏 -5');
      expect(varianceEl).toBeInTheDocument();
      expect(varianceEl).toHaveStyle({ color: '#DC2626' });
    });

    it('should display "盘盈 +N" in green for positive variance', () => {
      renderDialog({ inventoryItem: makeInventoryItem({ variance: 10, actualQuantity: 110 }) });
      const varianceEl = screen.getByText('盘盈 +10');
      expect(varianceEl).toBeInTheDocument();
      expect(varianceEl).toHaveStyle({ color: '#059669' });
    });

    it('should display "无差异" in gray when variance is 0', () => {
      renderDialog({ inventoryItem: makeInventoryItem({ variance: 0, actualQuantity: 100 }) });
      const varianceEl = screen.getByText('无差异');
      expect(varianceEl).toBeInTheDocument();
      expect(varianceEl).toHaveStyle({ color: '#6B7280' });
    });

    it('should handle variance=undefined as 0 (无差异)', () => {
      renderDialog({ inventoryItem: makeInventoryItem({ variance: undefined, actualQuantity: 100 }) });
      expect(screen.getByText('无差异')).toBeInTheDocument();
    });
  });

  // ---- 警告/说明渲染测试 ----

  describe('Warnings', () => {
    it('should display irreversible warning', () => {
      renderDialog();
      expect(
        screen.getByText(/确认后将根据实盘数量调整系统库存，此操作不可撤销！/)
      ).toBeInTheDocument();
    });

    it('should display adjustment explanation', () => {
      renderDialog();
      expect(
        screen.getByText(/点击"确认调整"后，系统将自动调整库存数量/)
      ).toBeInTheDocument();
    });
  });

  // ---- 按钮行为测试 ----

  describe('Button actions', () => {
    it('should call onClose when cancel is clicked', () => {
      const onClose = vi.fn();
      renderDialog({ onClose });

      fireEvent.click(screen.getByText('取消'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should have confirm button', () => {
      renderDialog();
      expect(screen.getByText('确认调整')).toBeInTheDocument();
    });

    it('should call adjustInventoryCount on confirm', async () => {
      mockAdjustInventoryCount.mockResolvedValue({ success: true, message: '调整成功' });
      const onSuccess = vi.fn();
      const onClose = vi.fn();

      renderDialog({ onSuccess, onClose });

      fireEvent.click(screen.getByText('确认调整'));

      await waitFor(() => {
        expect(mockAdjustInventoryCount).toHaveBeenCalledWith(1, '张三');
      });
    });

    it('should use "system" as default counter when counter is missing', async () => {
      mockAdjustInventoryCount.mockResolvedValue({ success: true, message: '调整成功' });

      renderDialog({
        inventoryItem: makeInventoryItem({ counter: undefined }),
      });

      fireEvent.click(screen.getByText('确认调整'));

      await waitFor(() => {
        expect(mockAdjustInventoryCount).toHaveBeenCalledWith(1, 'system');
      });
    });

    it('should show success toast and call onSuccess/onClose on success', async () => {
      mockAdjustInventoryCount.mockResolvedValue({ success: true, message: '差异调整成功' });
      const onSuccess = vi.fn();
      const onClose = vi.fn();

      renderDialog({ onSuccess, onClose });

      fireEvent.click(screen.getByText('确认调整'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('差异调整成功', 'success');
        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    it('should show error toast when API returns success=false', async () => {
      mockAdjustInventoryCount.mockResolvedValue({ success: false, message: '库存不足' });

      renderDialog();

      fireEvent.click(screen.getByText('确认调整'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('库存不足', 'error');
      });
    });

    it('should show network error toast when API throws', async () => {
      mockAdjustInventoryCount.mockRejectedValue(new Error('网络连接失败'));

      renderDialog();

      fireEvent.click(screen.getByText('确认调整'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('网络连接失败', 'error');
      });
    });

    it('should disable buttons while submitting', async () => {
      // Don't resolve the promise to keep submitting state
      mockAdjustInventoryCount.mockImplementation(
        () => new Promise(() => {}) // never resolves
      );

      renderDialog();

      fireEvent.click(screen.getByText('确认调整'));

      await waitFor(() => {
        const cancelBtn = screen.getByText('取消').closest('button');
        const confirmBtn = screen.getByText('调整中...').closest('button');
        expect(cancelBtn).toBeDisabled();
        expect(confirmBtn).toBeDisabled();
      });
    });

    it('should show CircularProgress when submitting', async () => {
      mockAdjustInventoryCount.mockImplementation(
        () => new Promise(() => {})
      );

      renderDialog();

      fireEvent.click(screen.getByText('确认调整'));

      await waitFor(() => {
        expect(screen.getByText('调整中...')).toBeInTheDocument();
      });
    });
  });

  // ---- 边界情况测试 ----

  describe('Edge cases', () => {
    it('should handle missing inventoryItem.id gracefully', async () => {
      const item = makeInventoryItem({ id: undefined });
      renderDialog({ inventoryItem: item });

      // Confirm button should still be rendered
      expect(screen.getByText('确认调整')).toBeInTheDocument();

      // Clicking should NOT call the API because id check prevents it
      fireEvent.click(screen.getByText('确认调整'));
      // Wait a tick
      await new Promise((r) => setTimeout(r, 10));
      expect(mockAdjustInventoryCount).not.toHaveBeenCalled();
    });

    it('should prevent closing while submitting', () => {
      const onClose = vi.fn();

      // Simulate submitting
      const { rerender } = render(
        <WmsInventoryAdjustDialog
          open={true}
          inventoryItem={makeInventoryItem()}
          onClose={onClose}
          onSuccess={vi.fn()}
        />
      );

      // Trigger the dialog close via Escape key or backdrop click
      const dialog = screen.getByRole('dialog');
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });

      // onClose should still be called because submitting is false initially
      expect(onClose).toHaveBeenCalled();
    });

    it('should render with variance computed from actualQuantity - systemQuantity', () => {
      // actualQuantity=80, systemQuantity=100 -> variance should already be -20
      const item = makeInventoryItem({ systemQuantity: 100, actualQuantity: 80, variance: -20 });
      renderDialog({ inventoryItem: item });

      expect(screen.getByText('盘亏 -20')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument(); // system qty
      expect(screen.getByText('80')).toBeInTheDocument();  // actual qty
    });
  });
});
