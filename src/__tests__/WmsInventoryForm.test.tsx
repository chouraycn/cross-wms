/**
 * WmsInventoryForm 组件单元测试
 *
 * 测试范围：
 * - getFormMode() 模式判断逻辑
 * - 各模式下的渲染行为
 * - 必填字段校验
 * - 差异自动计算逻辑
 * - count 模式提交时状态流转
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import WmsInventoryForm, { type WmsInventoryFormProps } from '@/components/wms/WmsInventoryForm';
import type { InventoryCount } from '@/types/wms';

// ===================== Mock 依赖 =====================

// Mock ToastContext
const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// Mock API functions
const mockCreateInventoryCount = vi.fn();
const mockUpdateInventoryCount = vi.fn();
const mockFetchInventoryCountById = vi.fn();

vi.mock('@/api/wmsInventoryApi', () => ({
  createInventoryCount: (...args: unknown[]) => mockCreateInventoryCount(...args),
  updateInventoryCount: (...args: unknown[]) => mockUpdateInventoryCount(...args),
  fetchInventoryCountById: (...args: unknown[]) => mockFetchInventoryCountById(...args),
}));

// ===================== 测试辅助 =====================

function renderForm(props: Partial<WmsInventoryFormProps> = {}) {
  const defaultProps: WmsInventoryFormProps = {
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    initialData: null,
    ...props,
  };
  return render(<WmsInventoryForm {...defaultProps} />);
}

const pendingItem: InventoryCount = {
  id: 1,
  warehouseId: 'WH-001',
  locationCode: 'A-01-01',
  sku: 'SKU001',
  systemQuantity: 100,
  status: 'pending',
  counter: '',
  notes: '',
};

const countedItem: InventoryCount = {
  id: 2,
  warehouseId: 'WH-001',
  locationCode: 'A-02-01',
  sku: 'SKU002',
  systemQuantity: 50,
  actualQuantity: 48,
  variance: -2,
  status: 'counted',
  counter: '张三',
  notes: '',
};

const adjustedItem: InventoryCount = {
  id: 3,
  warehouseId: 'WH-001',
  locationCode: 'A-03-01',
  sku: 'SKU003',
  systemQuantity: 200,
  actualQuantity: 195,
  variance: -5,
  status: 'adjusted',
  counter: '李四',
  countTime: '2025-01-15T10:30:00Z',
  notes: '已确认调整',
};

// ===================== 测试用例 =====================

describe('WmsInventoryForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认让 fetchInventoryCountById 返回传入的 initialData
    mockFetchInventoryCountById.mockImplementation((id: number) => {
      if (id === 1) return Promise.resolve(pendingItem);
      if (id === 2) return Promise.resolve(countedItem);
      if (id === 3) return Promise.resolve(adjustedItem);
      return Promise.resolve(null);
    });
  });

  // ---------- 模式判断与标题渲染 ----------

  describe('Form Mode Detection', () => {
    it('should show create mode when no initialData', () => {
      renderForm();
      expect(screen.getByText('新增盘点单')).toBeInTheDocument();
    });

    it('should show count mode when initialData status is pending', async () => {
      renderForm({ initialData: pendingItem });
      await waitFor(() => {
        expect(screen.getByText('录入实盘数量')).toBeInTheDocument();
      });
    });

    it('should show view mode when initialData status is counted', async () => {
      renderForm({ initialData: countedItem });
      await waitFor(() => {
        expect(screen.getByText('查看盘点详情')).toBeInTheDocument();
      });
    });

    it('should show view mode when initialData status is adjusted', async () => {
      renderForm({ initialData: adjustedItem });
      await waitFor(() => {
        expect(screen.getByText('查看盘点详情')).toBeInTheDocument();
      });
    });
  });

  // ---------- 必填字段校验 ----------

  describe('Required Field Validation', () => {
    it('should show error toast when submitting create form with empty fields', async () => {
      renderForm();
      const submitBtn = screen.getByText('创建');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('请填写'), 'error');
      });
    });

    it('should show error toast when submitting count form without actualQuantity', async () => {
      renderForm({ initialData: pendingItem });

      await waitFor(() => {
        expect(screen.getByText('录入实盘数量')).toBeInTheDocument();
      });

      const submitBtn = screen.getByText('提交实盘数量');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('请填写有效的实盘数量', 'error');
      });
    });
  });

  // ---------- 差异计算逻辑 ----------

  describe('Variance Auto-Calculation', () => {
    it('should auto-calculate variance when actualQuantity changes', async () => {
      renderForm({ initialData: pendingItem });

      await waitFor(() => {
        expect(screen.getByText('录入实盘数量')).toBeInTheDocument();
      });

      // 输入实盘数量
      const actualInput = screen.getByPlaceholderText('请输入实盘数量');
      fireEvent.change(actualInput, { target: { value: '95' } });

      // 差异应显示为 -5
      await waitFor(() => {
        const varianceInput = screen.getByDisplayValue('-5');
        expect(varianceInput).toBeInTheDocument();
      });
    });
  });

  // ---------- View 模式只读行为 ----------

  describe('View Mode (counted/adjusted)', () => {
    it('should show close button instead of submit in view mode', async () => {
      renderForm({ initialData: countedItem });

      await waitFor(() => {
        expect(screen.getByText('查看盘点详情')).toBeInTheDocument();
      });

      expect(screen.getByText('关闭')).toBeInTheDocument();
      expect(screen.queryByText('提交实盘数量')).not.toBeInTheDocument();
      expect(screen.queryByText('创建')).not.toBeInTheDocument();
    });

    it('should not call any API when closing view mode', async () => {
      const onClose = vi.fn();
      renderForm({ initialData: adjustedItem, onClose });

      await waitFor(() => {
        expect(screen.getByText('查看盘点详情')).toBeInTheDocument();
      });

      const closeBtn = screen.getByText('关闭');
      fireEvent.click(closeBtn);

      expect(onClose).toHaveBeenCalled();
      expect(mockCreateInventoryCount).not.toHaveBeenCalled();
      expect(mockUpdateInventoryCount).not.toHaveBeenCalled();
    });
  });

  // ---------- Count 模式提交 ----------

  describe('Count Mode Submission', () => {
    it('should call updateInventoryCount with status counted when submitting count', async () => {
      mockUpdateInventoryCount.mockResolvedValueOnce({
        ...pendingItem,
        actualQuantity: 95,
        variance: -5,
        status: 'counted',
      });

      const onSuccess = vi.fn();
      const onClose = vi.fn();
      renderForm({ initialData: pendingItem, onSuccess, onClose });

      await waitFor(() => {
        expect(screen.getByText('录入实盘数量')).toBeInTheDocument();
      });

      // 输入实盘数量
      const actualInput = screen.getByPlaceholderText('请输入实盘数量');
      fireEvent.change(actualInput, { target: { value: '95' } });

      // 提交
      const submitBtn = screen.getByText('提交实盘数量');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockUpdateInventoryCount).toHaveBeenCalledWith(1, expect.objectContaining({
          actualQuantity: 95,
          status: 'counted',
        }));
      });

      expect(mockShowToast).toHaveBeenCalledWith('实盘数量录入成功', 'success');
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ---------- Create 模式提交 ----------

  describe('Create Mode Submission', () => {
    it('should call createInventoryCount when submitting create form', async () => {
      mockCreateInventoryCount.mockResolvedValueOnce({
        id: 10,
        warehouseId: 'WH-002',
        locationCode: 'B-01-01',
        sku: 'SKU010',
        systemQuantity: 50,
        status: 'pending',
      });

      const onSuccess = vi.fn();
      const onClose = vi.fn();
      renderForm({ onSuccess, onClose });

      // 填写必填字段
      const warehouseInput = screen.getByPlaceholderText('例如：WH-001');
      fireEvent.change(warehouseInput, { target: { value: 'WH-002' } });

      const locationInput = screen.getByPlaceholderText('例如：A-01-01');
      fireEvent.change(locationInput, { target: { value: 'B-01-01' } });

      const skuInput = screen.getByPlaceholderText('例如：SKU001');
      fireEvent.change(skuInput, { target: { value: 'SKU010' } });

      // 提交
      const submitBtn = screen.getByText('创建');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockCreateInventoryCount).toHaveBeenCalled();
      });

      expect(mockShowToast).toHaveBeenCalledWith('盘点单创建成功', 'success');
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  // ---------- Count 模式下字段禁用 ----------

  describe('Count Mode Field Disable', () => {
    it('should disable warehouseId, locationCode, and SKU in count mode', async () => {
      renderForm({ initialData: pendingItem });

      await waitFor(() => {
        expect(screen.getByText('录入实盘数量')).toBeInTheDocument();
      });

      // 仓库ID 应被禁用
      const warehouseInput = screen.getByDisplayValue('WH-001');
      expect(warehouseInput).toBeDisabled();

      // 库位编码应被禁用
      const locationInput = screen.getByDisplayValue('A-01-01');
      expect(locationInput).toBeDisabled();

      // SKU 应被禁用
      const skuInput = screen.getByDisplayValue('SKU001');
      expect(skuInput).toBeDisabled();
    });
  });

  // ---------- 关闭行为 ----------

  describe('Close Behavior', () => {
    it('should call onClose when clicking cancel button in create mode', async () => {
      const onClose = vi.fn();
      renderForm({ onClose });

      const cancelBtn = screen.getByText('取消');
      fireEvent.click(cancelBtn);

      expect(onClose).toHaveBeenCalled();
    });
  });
});
