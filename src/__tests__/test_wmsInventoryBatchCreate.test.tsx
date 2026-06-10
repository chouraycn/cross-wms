/**
 * WmsInventoryBatchCreate 组件单元测试
 *
 * 测试范围：
 * - open=false 时不渲染
 * - open=true 时渲染标题和默认行
 * - 行操作（添加/删除）
 * - 字段修改
 * - 粘贴解析（有效/空/无效）
 * - 表单验证
 * - 提交 API 调用
 * - 提交成功/失败
 * - submitting 状态
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WmsInventoryBatchCreate from '@/components/wms/WmsInventoryBatchCreate';

// ===================== Mock 依赖 =====================

const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockCreateInventoryCount = vi.fn();
vi.mock('@/api/wmsInventoryApi', () => ({
  createInventoryCount: (...args: unknown[]) => mockCreateInventoryCount(...args),
  adjustInventoryCount: vi.fn(),
}));

// ===================== 辅助函数 =====================

function renderBatchCreate(open: boolean = true) {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const result = render(
    <WmsInventoryBatchCreate
      open={open}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
  return { ...result, onClose, onSuccess };
}

beforeEach(() => {
  mockShowToast.mockClear();
  mockCreateInventoryCount.mockClear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===================== 测试用例 =====================

describe('WmsInventoryBatchCreate', () => {
  // ---- 渲染控制测试 ----

  describe('Visibility', () => {
    it('should not render dialog when open=false', () => {
      renderBatchCreate(false);
      expect(screen.queryByText('批量创建盘点单')).not.toBeInTheDocument();
    });

    it('should render dialog title when open=true', () => {
      renderBatchCreate();
      expect(screen.getByText('批量创建盘点单')).toBeInTheDocument();
    });

    it('should render info alert with format instructions', () => {
      renderBatchCreate();
      expect(
        screen.getByText(/支持从 Excel 复制数据粘贴/)
      ).toBeInTheDocument();
    });
  });

  // ---- 默认行和行数测试 ----

  describe('Default state', () => {
    it('should have one empty row by default', () => {
      renderBatchCreate();
      expect(screen.getByText('共 1 条记录')).toBeInTheDocument();
    });

    it('should render table headers', () => {
      renderBatchCreate();
      expect(screen.getByText('#')).toBeInTheDocument();
      expect(screen.getByText('仓库ID *')).toBeInTheDocument();
      expect(screen.getByText('库位编码 *')).toBeInTheDocument();
      expect(screen.getByText('SKU *')).toBeInTheDocument();
      expect(screen.getByText('系统数量')).toBeInTheDocument();
    });

    it('should render paste textarea', () => {
      renderBatchCreate();
      expect(screen.getByLabelText('从Excel粘贴数据（可选）')).toBeInTheDocument();
    });

    it('should render parse button', () => {
      renderBatchCreate();
      expect(screen.getByText('解析粘贴数据')).toBeInTheDocument();
    });

    it('should render add row button', () => {
      renderBatchCreate();
      expect(screen.getByText('添加行')).toBeInTheDocument();
    });
  });

  // ---- 行操作测试 ----

  describe('Row operations', () => {
    it('should add a new row when clicking add row button', async () => {
      renderBatchCreate();

      fireEvent.click(screen.getByText('添加行'));

      await waitFor(() => {
        expect(screen.getByText('共 2 条记录')).toBeInTheDocument();
      });
    });

    it('should delete a row when clicking delete button', async () => {
      renderBatchCreate();

      // Add a row first
      fireEvent.click(screen.getByText('添加行'));
      await waitFor(() => {
        expect(screen.getByText('共 2 条记录')).toBeInTheDocument();
      });

      // Find and click the first delete button
      const deleteButtons = screen.getAllByLabelText('删除');
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('共 1 条记录')).toBeInTheDocument();
      });
    });

    it('should reset rows when dialog reopens', async () => {
      const { rerender } = render(
        <WmsInventoryBatchCreate open={true} onClose={vi.fn()} onSuccess={vi.fn()} />
      );

      // Add some rows
      fireEvent.click(screen.getByText('添加行'));
      fireEvent.click(screen.getByText('添加行'));
      await waitFor(() => {
        expect(screen.getByText('共 3 条记录')).toBeInTheDocument();
      });

      // Close and reopen
      rerender(
        <WmsInventoryBatchCreate open={false} onClose={vi.fn()} onSuccess={vi.fn()} />
      );
      rerender(
        <WmsInventoryBatchCreate open={true} onClose={vi.fn()} onSuccess={vi.fn()} />
      );

      await waitFor(() => {
        expect(screen.getByText('共 1 条记录')).toBeInTheDocument();
      });
    });

    it('should show record count dynamically', async () => {
      renderBatchCreate();

      for (let i = 0; i < 3; i++) {
        fireEvent.click(screen.getByText('添加行'));
      }

      await waitFor(() => {
        expect(screen.getByText('共 4 条记录')).toBeInTheDocument();
      });
    });
  });

  // ---- 字段修改测试 ----

  describe('Field editing', () => {
    it('should update warehouseId field', async () => {
      renderBatchCreate();

      const inputs = screen.getAllByPlaceholderText('WH-001');
      fireEvent.change(inputs[0], { target: { value: 'WH-NEW' } });

      expect(inputs[0]).toHaveValue('WH-NEW');
    });

    it('should update locationCode field', async () => {
      renderBatchCreate();

      const inputs = screen.getAllByPlaceholderText('A-01-01');
      fireEvent.change(inputs[0], { target: { value: 'B-02-03' } });

      expect(inputs[0]).toHaveValue('B-02-03');
    });

    it('should update SKU field', async () => {
      renderBatchCreate();

      const inputs = screen.getAllByPlaceholderText('SKU001');
      fireEvent.change(inputs[0], { target: { value: 'SKU-NEW' } });

      expect(inputs[0]).toHaveValue('SKU-NEW');
    });

    it('should update systemQuantity field', async () => {
      renderBatchCreate();

      // Find the number input
      const numberInputs = screen.getAllByRole('spinbutton');
      fireEvent.change(numberInputs[0], { target: { value: '50' } });

      expect(numberInputs[0]).toHaveValue(50);
    });
  });

  // ---- 粘贴解析测试 ----

  describe('Paste parsing', () => {
    it('should parse valid tab-separated data', async () => {
      renderBatchCreate();

      const pasteArea = screen.getByLabelText('从Excel粘贴数据（可选）');
      fireEvent.change(pasteArea, { target: { value: 'WH-001\tA-01-01\tSKU001\t100\nWH-002\tB-02-02\tSKU002\t200' } });

      fireEvent.click(screen.getByText('解析粘贴数据'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('已添加 2 条记录', 'success');
        expect(screen.getByText('共 3 条记录')).toBeInTheDocument(); // 1 default + 2 pasted
      });
    });

    it('should show warning for empty paste buffer', async () => {
      renderBatchCreate();

      fireEvent.click(screen.getByText('解析粘贴数据'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('请先粘贴数据', 'warning');
      });
    });

    it('should show warning for invalid format data', async () => {
      renderBatchCreate();

      const pasteArea = screen.getByLabelText('从Excel粘贴数据（可选）');
      // Only 2 columns (need at least 3)
      fireEvent.change(pasteArea, { target: { value: 'col1\tcol2' } });

      fireEvent.click(screen.getByText('解析粘贴数据'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('未识别到有效数据，请检查格式', 'warning');
      });
    });

    it('should parse data with quantity=0 as default', async () => {
      renderBatchCreate();

      const pasteArea = screen.getByLabelText('从Excel粘贴数据（可选）');
      // Only 3 columns, no 4th quantity column
      fireEvent.change(pasteArea, { target: { value: 'WH-001\tA-01-01\tSKU001' } });

      fireEvent.click(screen.getByText('解析粘贴数据'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('已添加 1 条记录', 'success');
      });
    });
  });

  // ---- 验证测试 ----

  describe('Validation', () => {
    it('should show error when submitting with empty warehouseId', async () => {
      renderBatchCreate();

      fireEvent.click(screen.getByText(/创建 \d+ 条记录/));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('请填写仓库ID'),
          'error'
        );
      });
    });

    it('should show error when submitting with empty locationCode', async () => {
      renderBatchCreate();

      // Fill warehouse but leave locationCode empty
      const whInputs = screen.getAllByPlaceholderText('WH-001');
      fireEvent.change(whInputs[0], { target: { value: 'WH-001' } });

      fireEvent.click(screen.getByText(/创建 \d+ 条记录/));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('请填写库位编码'),
          'error'
        );
      });
    });

    it('should show error when submitting with empty SKU', async () => {
      renderBatchCreate();

      // Fill warehouse and location but leave SKU empty
      const whInputs = screen.getAllByPlaceholderText('WH-001');
      fireEvent.change(whInputs[0], { target: { value: 'WH-001' } });
      const locInputs = screen.getAllByPlaceholderText('A-01-01');
      fireEvent.change(locInputs[0], { target: { value: 'A-01-01' } });

      fireEvent.click(screen.getByText(/创建 \d+ 条记录/));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('请填写SKU'),
          'error'
        );
      });
    });

    it('should validate each row independently', async () => {
      renderBatchCreate();

      // Add a second row
      fireEvent.click(screen.getByText('添加行'));
      await waitFor(() => {
        expect(screen.getByText('共 2 条记录')).toBeInTheDocument();
      });

      // Fill first row completely
      const whInputs = screen.getAllByPlaceholderText('WH-001');
      const locInputs = screen.getAllByPlaceholderText('A-01-01');
      const skuInputs = screen.getAllByPlaceholderText('SKU001');

      fireEvent.change(whInputs[0], { target: { value: 'WH-001' } });
      fireEvent.change(locInputs[0], { target: { value: 'A-01-01' } });
      fireEvent.change(skuInputs[0], { target: { value: 'SKU-001' } });

      // Second row is empty → should fail
      fireEvent.click(screen.getByText(/创建 2 条记录/));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('第 2 行'),
          'error'
        );
      });
    });
  });

  // ---- 提交 API 测试 ----

  describe('Submit API', () => {
    it('should call createInventoryCount on submit', async () => {
      mockCreateInventoryCount.mockResolvedValue({});

      renderBatchCreate();

      // Fill required fields
      const whInputs = screen.getAllByPlaceholderText('WH-001');
      const locInputs = screen.getAllByPlaceholderText('A-01-01');
      const skuInputs = screen.getAllByPlaceholderText('SKU001');

      fireEvent.change(whInputs[0], { target: { value: 'WH-001' } });
      fireEvent.change(locInputs[0], { target: { value: 'A-01-01' } });
      fireEvent.change(skuInputs[0], { target: { value: 'SKU-001' } });

      fireEvent.click(screen.getByText(/创建 1 条记录/));

      await waitFor(() => {
        expect(mockCreateInventoryCount).toHaveBeenCalledTimes(1);
        const arg = mockCreateInventoryCount.mock.calls[0][0];
        expect(Array.isArray(arg)).toBe(true);
        expect(arg[0]).toMatchObject({
          warehouseId: 'WH-001',
          locationCode: 'A-01-01',
          sku: 'SKU-001',
          systemQuantity: 0,
          status: 'pending',
        });
      });
    });

    it('should show success toast and call onClose/onSuccess on success', async () => {
      mockCreateInventoryCount.mockResolvedValue({});
      const { onClose, onSuccess } = renderBatchCreate();

      // Fill required fields
      fireEvent.change(screen.getAllByPlaceholderText('WH-001')[0], { target: { value: 'WH-001' } });
      fireEvent.change(screen.getAllByPlaceholderText('A-01-01')[0], { target: { value: 'A-01-01' } });
      fireEvent.change(screen.getAllByPlaceholderText('SKU001')[0], { target: { value: 'SKU-001' } });

      fireEvent.click(screen.getByText(/创建 1 条记录/));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('成功创建 1 条盘点记录', 'success');
        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    it('should show error toast on API failure', async () => {
      mockCreateInventoryCount.mockRejectedValue(new Error('服务器错误'));

      renderBatchCreate();

      // Fill required fields
      fireEvent.change(screen.getAllByPlaceholderText('WH-001')[0], { target: { value: 'WH-001' } });
      fireEvent.change(screen.getAllByPlaceholderText('A-01-01')[0], { target: { value: 'A-01-01' } });
      fireEvent.change(screen.getAllByPlaceholderText('SKU001')[0], { target: { value: 'SKU-001' } });

      fireEvent.click(screen.getByText(/创建 1 条记录/));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('服务器错误', 'error');
      });
    });

    it('should disable buttons while submitting', async () => {
      mockCreateInventoryCount.mockImplementation(() => new Promise(() => {}));

      renderBatchCreate();

      // Fill required fields
      fireEvent.change(screen.getAllByPlaceholderText('WH-001')[0], { target: { value: 'WH-001' } });
      fireEvent.change(screen.getAllByPlaceholderText('A-01-01')[0], { target: { value: 'A-01-01' } });
      fireEvent.change(screen.getAllByPlaceholderText('SKU001')[0], { target: { value: 'SKU-001' } });

      fireEvent.click(screen.getByText(/创建 1 条记录/));

      await waitFor(() => {
        const cancelBtn = screen.getByText('取消').closest('button');
        const submitBtn = screen.getByText('提交中...').closest('button');
        expect(cancelBtn).toBeDisabled();
        expect(submitBtn).toBeDisabled();
      });
    });

    it('should disable submit button when no rows exist', () => {
      // Can't directly test rows.length === 0 because default is 1
      // But the button is disabled when submitting || rows.length === 0
      renderBatchCreate();

      // Delete the only row
      const deleteBtn = screen.getByLabelText('删除');
      fireEvent.click(deleteBtn);

      // Now rows.length === 0, submit should be disabled
      const submitBtn = screen.getByText(/创建 0 条记录/).closest('button');
      expect(submitBtn).toBeDisabled();
    });
  });
});
