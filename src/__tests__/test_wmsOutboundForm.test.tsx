/**
 * WmsOutboundForm 组件单元测试
 *
 * 测试范围：
 * - 新增/编辑模式检测
 * - 必填字段校验
 * - 扫描模拟（递增扫描数量）
 * - 自动判定复核状态（通过/待复核）
 * - 扫描进度显示
 * - 提交成功/失败
 * - 取消关闭
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WmsOutboundForm, { type WmsOutboundFormProps } from '@/components/wms/WmsOutboundForm';
import type { OutboundReview } from '@/types/wms';

// ===================== Mock 依赖 =====================

const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// Mock global fetch
const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

// ===================== 测试数据 =====================

const pendingReview: OutboundReview = {
  id: 1,
  outboundOrderId: 'OUT-20240001',
  warehouseId: 'WH-001',
  sku: 'SKU001',
  productName: '蓝牙耳机',
  expectedQuantity: 10,
  scannedQuantity: 0,
  reviewStatus: 'pending',
  reviewer: '',
  notes: '',
};

const passedReview: OutboundReview = {
  id: 2,
  outboundOrderId: 'OUT-20240002',
  warehouseId: 'WH-002',
  sku: 'SKU002',
  productName: '数据线',
  expectedQuantity: 20,
  scannedQuantity: 20,
  reviewStatus: 'passed',
  reviewer: '张三',
  notes: '',
};

// ===================== 渲染辅助 =====================

function renderForm(props: Partial<WmsOutboundFormProps> = {}) {
  const defaultProps: WmsOutboundFormProps = {
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    initialData: null,
    ...props,
  };
  return render(<WmsOutboundForm {...defaultProps} />);
}

// ===================== 测试用例 =====================

describe('WmsOutboundForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ---------- 模式检测 ----------

  describe('Mode Detection', () => {
    it('should show create mode title when no initialData', () => {
      renderForm();
      expect(screen.getByText('新增出库复核')).toBeInTheDocument();
    });

    it('should show edit mode title when initialData has id', () => {
      renderForm({ initialData: pendingReview });
      expect(screen.getByText('编辑复核记录')).toBeInTheDocument();
    });

    it('should show "创建" button in create mode', () => {
      renderForm();
      expect(screen.getByText('创建')).toBeInTheDocument();
    });

    it('should show "更新" button in edit mode', () => {
      renderForm({ initialData: pendingReview });
      expect(screen.getByText('更新')).toBeInTheDocument();
    });
  });

  // ---------- 必填字段校验 ----------

  describe('Validation', () => {
    it('should show error when outboundOrderId is empty', async () => {
      renderForm();
      const submitBtn = screen.getByText('创建');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('请输入出库单号', 'error');
      });
    });

    it('should show error when warehouseId is empty', async () => {
      renderForm();
      // Fill outboundOrderId but leave warehouseId empty
      const orderInput = screen.getByPlaceholderText('例如：OUT-20240001');
      fireEvent.change(orderInput, { target: { value: 'OUT-001' } });

      const submitBtn = screen.getByText('创建');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('请选择仓库', 'error');
      });
    });

    it('should show error when SKU is empty', async () => {
      renderForm();
      fireEvent.change(screen.getByPlaceholderText('例如：OUT-20240001'), { target: { value: 'OUT-001' } });
      fireEvent.change(screen.getByPlaceholderText('例如：WH-001'), { target: { value: 'WH-001' } });

      const submitBtn = screen.getByText('创建');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('请输入SKU', 'error');
      });
    });

    it('should show error when expectedQuantity is 0', async () => {
      renderForm();
      fireEvent.change(screen.getByPlaceholderText('例如：OUT-20240001'), { target: { value: 'OUT-001' } });
      fireEvent.change(screen.getByPlaceholderText('例如：WH-001'), { target: { value: 'WH-001' } });
      fireEvent.change(screen.getByPlaceholderText('例如：SKU001'), { target: { value: 'SKU001' } });

      const submitBtn = screen.getByText('创建');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('预期数量必须大于0', 'error');
      });
    });
  });

  // ---------- 扫描模拟 ----------

  describe('Simulated Scan', () => {
    it('should increment scannedQuantity when scan button is clicked', async () => {
      renderForm({ initialData: pendingReview });

      const scanBtn = screen.getByText('模拟扫描 +1');
      fireEvent.click(scanBtn);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('已扫描第 1 件', 'info');
      });
    });
  });

  // ---------- 复核状态自动判定 ----------

  describe('Auto Status Detection', () => {
    it('should set reviewStatus to passed when scanned >= expected', async () => {
      renderForm({ initialData: pendingReview });

      // Set expected quantity to 1, scanned to 1
      const scannedInput = document.querySelectorAll('input[type="number"]')[1] as HTMLInputElement;
      fireEvent.change(scannedInput, { target: { value: '10' } });

      await waitFor(() => {
        // 10 >= 10 → passed
        // Check the select shows "已通过"
        expect(screen.getByText('已通过')).toBeInTheDocument();
      });
    });

    it('should set reviewStatus to pending when scanned < expected', async () => {
      renderForm({ initialData: pendingReview });

      // expected=10, scanned=5 → pending
      const scannedInput = document.querySelectorAll('input[type="number"]')[1] as HTMLInputElement;
      fireEvent.change(scannedInput, { target: { value: '5' } });

      await waitFor(() => {
        expect(screen.getByText('待复核')).toBeInTheDocument();
      });
    });
  });

  // ---------- 提交 ----------

  describe('Submission', () => {
    it('should call API with POST in create mode', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 0, success: true }),
      });

      const onSuccess = vi.fn();
      const onClose = vi.fn();
      renderForm({ onSuccess, onClose });

      // Fill all required fields
      fireEvent.change(screen.getByPlaceholderText('例如：OUT-20240001'), { target: { value: 'OUT-001' } });
      fireEvent.change(screen.getByPlaceholderText('例如：WH-001'), { target: { value: 'WH-001' } });
      fireEvent.change(screen.getByPlaceholderText('例如：SKU001'), { target: { value: 'SKU001' } });
      // Set expected quantity
      const qtyInput = document.querySelectorAll('input[type="number"]')[0] as HTMLInputElement;
      fireEvent.change(qtyInput, { target: { value: '5' } });

      fireEvent.click(screen.getByText('创建'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/wms/outbound'),
          expect.objectContaining({ method: 'POST' })
        );
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('should show error toast on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network Error'));

      renderForm({ initialData: pendingReview });

      fireEvent.click(screen.getByText('更新'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('网络错误', 'error');
      });
    });

    it('should show error toast when API returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 1, message: '出库单号重复' }),
      });

      renderForm({ initialData: pendingReview });

      fireEvent.click(screen.getByText('更新'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('出库单号重复', 'error');
      });
    });
  });

  // ---------- 关闭 ----------

  describe('Close Behavior', () => {
    it('should call onClose when cancel button is clicked', () => {
      const onClose = vi.fn();
      renderForm({ onClose });

      fireEvent.click(screen.getByText('取消'));
      expect(onClose).toHaveBeenCalled();
    });

    it('should disable buttons when submitting', async () => {
      mockFetch.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ json: () => Promise.resolve({ code: 0 }) }), 1000))
      );

      renderForm({ initialData: pendingReview });

      fireEvent.click(screen.getByText('更新'));

      await waitFor(() => {
        expect(screen.getByText('取消')).toBeDisabled();
        expect(screen.getByText('提交中...')).toBeInTheDocument();
      });
    });
  });
});
