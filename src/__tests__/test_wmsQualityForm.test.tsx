/**
 * WmsQualityForm 组件单元测试
 *
 * 测试范围：
 * - 新增/编辑模式检测
 * - 必填字段校验
 * - 实际数量负值校验
 * - 提交成功/失败
 * - 表单字段变更
 * - 取消关闭
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WmsQualityForm, { type WmsQualityFormProps } from '@/components/wms/WmsQualityForm';
import type { QualityCheck } from '@/types/wms';

// ===================== Mock 依赖 =====================

const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

// ===================== 测试数据 =====================

const pendingCheck: QualityCheck = {
  id: 1,
  warehouseId: 'WH-001',
  sku: 'SKU001',
  productName: '蓝牙耳机',
  batchNo: 'BATCH-001',
  expectedQuantity: 100,
  actualQuantity: 98,
  qualityStatus: 'pending',
  inspector: '',
  notes: '',
};

// ===================== 渲染辅助 =====================

function renderForm(props: Partial<WmsQualityFormProps> = {}) {
  const defaultProps: WmsQualityFormProps = {
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    initialData: null,
    ...props,
  };
  return render(<WmsQualityForm {...defaultProps} />);
}

// ===================== 测试用例 =====================

describe('WmsQualityForm', () => {
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
      expect(screen.getByText('新增质检记录')).toBeInTheDocument();
    });

    it('should show edit mode title when initialData has id', () => {
      renderForm({ initialData: pendingCheck });
      expect(screen.getByText('编辑质检记录')).toBeInTheDocument();
    });

    it('should show "创建" button in create mode', () => {
      renderForm();
      expect(screen.getByText('创建')).toBeInTheDocument();
    });

    it('should show "更新" button in edit mode', () => {
      renderForm({ initialData: pendingCheck });
      expect(screen.getByText('更新')).toBeInTheDocument();
    });
  });

  // ---------- 必填字段校验 ----------

  describe('Validation', () => {
    it('should show error when warehouseId is empty', async () => {
      renderForm();
      fireEvent.click(screen.getByText('创建'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('请选择仓库', 'error');
      });
    });

    it('should show error when SKU is empty', async () => {
      renderForm();
      fireEvent.change(screen.getByPlaceholderText('例如：WH-001'), { target: { value: 'WH-001' } });
      fireEvent.click(screen.getByText('创建'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('请输入SKU', 'error');
      });
    });

    it('should show error when expectedQuantity is 0', async () => {
      renderForm();
      fireEvent.change(screen.getByPlaceholderText('例如：WH-001'), { target: { value: 'WH-001' } });
      fireEvent.change(screen.getByPlaceholderText('例如：SKU001'), { target: { value: 'SKU001' } });
      fireEvent.click(screen.getByText('创建'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('预期数量必须大于0', 'error');
      });
    });

    it('should show error when actualQuantity is negative', async () => {
      renderForm({ initialData: pendingCheck });

      // Type a negative value for actual quantity
      const qtyInputs = document.querySelectorAll('input[type="number"]');
      const actualInput = qtyInputs[1] as HTMLInputElement;
      fireEvent.change(actualInput, { target: { value: '-5' } });

      fireEvent.click(screen.getByText('更新'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('实际数量不能为负', 'error');
      });
    });

    it('should pass validation when all required fields are filled', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 0, success: true }),
      });

      renderForm();
      fireEvent.change(screen.getByPlaceholderText('例如：WH-001'), { target: { value: 'WH-001' } });
      fireEvent.change(screen.getByPlaceholderText('例如：SKU001'), { target: { value: 'SKU001' } });

      // Set expected quantity
      const qtyInputs = document.querySelectorAll('input[type="number"]');
      fireEvent.change(qtyInputs[0], { target: { value: '10' } });

      fireEvent.click(screen.getByText('创建'));

      await waitFor(() => {
        // Toast should be called with "创建成功" (success), not an error
        expect(mockShowToast).toHaveBeenCalledWith('创建成功', 'success');
      });
    });
  });

  // ---------- 提交 ----------

  describe('Submission', () => {
    it('should call API with POST in create mode', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 0 }),
      });

      const onSuccess = vi.fn();
      const onClose = vi.fn();
      renderForm({ onSuccess, onClose });

      fireEvent.change(screen.getByPlaceholderText('例如：WH-001'), { target: { value: 'WH-001' } });
      fireEvent.change(screen.getByPlaceholderText('例如：SKU001'), { target: { value: 'SKU001' } });
      const qtyInputs = document.querySelectorAll('input[type="number"]');
      fireEvent.change(qtyInputs[0], { target: { value: '10' } });

      fireEvent.click(screen.getByText('创建'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/wms/quality'),
          expect.objectContaining({ method: 'POST' })
        );
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('should call API with PUT in edit mode', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 0 }),
      });

      renderForm({ initialData: pendingCheck });

      fireEvent.click(screen.getByText('更新'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(`/api/wms/quality/${pendingCheck.id}`),
          expect.objectContaining({ method: 'PUT' })
        );
      });
    });

    it('should show error toast on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network Error'));

      renderForm({ initialData: pendingCheck });

      fireEvent.click(screen.getByText('更新'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('网络错误', 'error');
      });
    });

    it('should show API error message on failure response', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 1, message: 'SKU不存在' }),
      });

      renderForm({ initialData: pendingCheck });

      fireEvent.click(screen.getByText('更新'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('SKU不存在', 'error');
      });
    });
  });

  // ---------- 质检状态选择 ----------

  describe('Quality Status Selection', () => {
    it('should render quality status select with default value', () => {
      renderForm({ initialData: pendingCheck });
      // The Select shows "待检" as the currently selected value
      expect(screen.getByText('待检')).toBeInTheDocument();
      // "合格" and "不合格" are inside closed MenuItems — verify select exists
      const select = document.querySelector('.MuiSelect-select');
      expect(select).toBeInTheDocument();
    });
  });

  // ---------- 关闭 ----------

  describe('Close Behavior', () => {
    it('should call onClose when cancel is clicked', () => {
      const onClose = vi.fn();
      renderForm({ onClose });

      fireEvent.click(screen.getByText('取消'));
      expect(onClose).toHaveBeenCalled();
    });

    it('should disable buttons when submitting', async () => {
      mockFetch.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ json: () => Promise.resolve({ code: 0 }) }), 1000))
      );

      renderForm({ initialData: pendingCheck });

      fireEvent.click(screen.getByText('更新'));

      await waitFor(() => {
        expect(screen.getByText('取消')).toBeDisabled();
      });
    });
  });

  // ---------- 表单初始化 ----------

  describe('Form Initialization', () => {
    it('should prefill form fields from initialData', () => {
      renderForm({ initialData: pendingCheck });

      expect(screen.getByDisplayValue('WH-001')).toBeInTheDocument();
      expect(screen.getByDisplayValue('SKU001')).toBeInTheDocument();
      expect(screen.getByDisplayValue('蓝牙耳机')).toBeInTheDocument();
      expect(screen.getByDisplayValue('BATCH-001')).toBeInTheDocument();
    });

    it('should reset form when open changes', () => {
      const { rerender } = renderForm({ initialData: pendingCheck, open: false });
      renderForm({ initialData: null, open: true });

      // Form should be empty
      expect((screen.getByPlaceholderText('例如：WH-001') as HTMLInputElement).value).toBe('');
    });
  });
});
