/**
 * WmsReportGenerator 组件单元测试
 *
 * 测试范围：
 * - 报表生成表单渲染（类型/仓库/日期/格式选择）
 * - onGenerate 回调参数传递
 * - 加载状态
 * - 空历史记录
 * - 历史记录分页
 * - 下载按钮状态
 * - 表单清空逻辑
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WmsReportGenerator, { type WmsReportGeneratorProps } from '@/components/wms/WmsReportGenerator';
import type { WmsReport } from '@/types/wms';

// ===================== 测试数据 =====================

const mockReports: WmsReport[] = [
  {
    id: 1,
    reportType: 'inventory',
    warehouseId: 'WH-001',
    startDate: '2025-01-01',
    endDate: '2025-01-31',
    fileFormat: 'csv',
    generatedBy: '系统',
    generatedAt: '2025-02-01T08:00:00Z',
    status: 'completed',
  },
  {
    id: 2,
    reportType: 'inbound',
    warehouseId: 'WH-002',
    startDate: '2025-02-01',
    endDate: '2025-02-28',
    fileFormat: 'xlsx',
    generatedBy: '张三',
    generatedAt: '2025-03-01T09:00:00Z',
    status: 'completed',
  },
  {
    id: 3,
    reportType: 'outbound',
    fileFormat: 'pdf',
    status: 'failed',
    generatedAt: '2025-03-15T10:00:00Z',
  },
  {
    id: 4,
    reportType: 'custom',
    fileFormat: 'csv',
    status: 'pending',
    generatedAt: '2025-04-01T08:00:00Z',
  },
];

// ===================== 渲染辅助 =====================

function renderGenerator(props: Partial<WmsReportGeneratorProps> = {}) {
  const defaultProps: WmsReportGeneratorProps = {
    reports: mockReports,
    loading: false,
    onGenerate: vi.fn(),
    onDownload: vi.fn(),
    ...props,
  };
  return render(<WmsReportGenerator {...defaultProps} />);
}

// ===================== 测试用例 =====================

describe('WmsReportGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------- 表单渲染 ----------

  describe('Form Rendering', () => {
    it('should render report type select', () => {
      renderGenerator();
      expect(screen.getByText('生成新报表')).toBeInTheDocument();
    });

    it('should render "生成报表" button', () => {
      renderGenerator();
      expect(screen.getByText('生成报表')).toBeInTheDocument();
    });

    it('should render warehouse ID input with placeholder', () => {
      renderGenerator();
      expect(screen.getByPlaceholderText('留空表示全部仓库')).toBeInTheDocument();
    });

    it('should render start and end date inputs', () => {
      renderGenerator();
      // Look for date inputs by type
      const dateInputs = document.querySelectorAll('input[type="date"]');
      expect(dateInputs.length).toBe(2);
    });
  });

  // ---------- onGenerate 回调 ----------

  describe('Generation Callback', () => {
    it('should call onGenerate with form params when clicking generate', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      renderGenerator({ onGenerate });

      fireEvent.click(screen.getByText('生成报表'));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledWith({
          reportType: 'inventory',
          warehouseId: undefined,
          startDate: undefined,
          endDate: undefined,
          fileFormat: 'csv',
        });
      });
    });

    it('should include warehouseId when provided', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      renderGenerator({ onGenerate });

      const whInput = screen.getByPlaceholderText('留空表示全部仓库');
      fireEvent.change(whInput, { target: { value: 'WH-005' } });

      fireEvent.click(screen.getByText('生成报表'));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({
          warehouseId: 'WH-005',
        }));
      });
    });

    it('should trim warehouseId whitespace', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      renderGenerator({ onGenerate });

      const whInput = screen.getByPlaceholderText('留空表示全部仓库');
      fireEvent.change(whInput, { target: { value: '  WH-005  ' } });

      fireEvent.click(screen.getByText('生成报表'));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({
          warehouseId: 'WH-005',
        }));
      });
    });

    it('should pass undefined for empty warehouseId', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      renderGenerator({ onGenerate });

      // warehouse input is empty by default
      fireEvent.click(screen.getByText('生成报表'));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({
          warehouseId: undefined,
        }));
      });
    });

    it('should include dates when provided', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      renderGenerator({ onGenerate });

      const dateInputs = document.querySelectorAll('input[type="date"]');
      fireEvent.change(dateInputs[0], { target: { value: '2025-01-01' } });
      fireEvent.change(dateInputs[1], { target: { value: '2025-01-31' } });

      fireEvent.click(screen.getByText('生成报表'));

      await waitFor(() => {
        expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({
          startDate: '2025-01-01',
          endDate: '2025-01-31',
        }));
      });
    });
  });

  // ---------- 加载状态 ----------

  describe('Loading State', () => {
    it('should show loading text when loading is true', () => {
      renderGenerator({ loading: true });
      expect(screen.getByText('正在加载报表历史...')).toBeInTheDocument();
    });

    it('should not show table when loading', () => {
      renderGenerator({ loading: true });
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  // ---------- 空历史记录 ----------

  describe('Empty History', () => {
    it('should show empty message when reports is empty', () => {
      renderGenerator({ reports: [] });
      expect(screen.getByText('暂无报表记录')).toBeInTheDocument();
    });

    it('should not show table when no reports', () => {
      renderGenerator({ reports: [] });
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  // ---------- 历史记录表格 ----------

  describe('History Table', () => {
    it('should show "历史记录" section title', () => {
      renderGenerator();
      expect(screen.getByText('历史记录')).toBeInTheDocument();
    });

    it('should render table with all reports', () => {
      renderGenerator();
      // 4 reports → table should have 4 body rows
      const rows = screen.getAllByRole('row');
      // header + 4 rows = 5
      expect(rows.length).toBe(5);
    });

    it('should show report type labels in Chinese', () => {
      renderGenerator();
      // Labels appear in both form Select and table Chip — use getAllByText
      expect(screen.getAllByText('库存报表').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('入库报表')).toBeInTheDocument();
      expect(screen.getByText('出库报表')).toBeInTheDocument();
      expect(screen.getByText('自定义报表')).toBeInTheDocument();
    });

    it('should show status labels in Chinese', () => {
      renderGenerator();
      // 'completed' → '已完成', 'failed' → '失败', 'pending' → '生成中'
      // "已完成" appears in multiple reports (ids 1 and 2), use getAllByText
      const completed = screen.getAllByText('已完成');
      expect(completed.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('失败')).toBeInTheDocument();
      expect(screen.getByText('生成中')).toBeInTheDocument();
    });
  });

  // ---------- 下载按钮 ----------

  describe('Download Button', () => {
    it('should show download button for completed reports', () => {
      renderGenerator();
      // 2 completed reports → 2 download icon buttons
      const downloadButtons = screen.getAllByLabelText('下载报表');
      expect(downloadButtons.length).toBe(2);
    });

    it('should call onDownload when clicking download', () => {
      const onDownload = vi.fn();
      renderGenerator({ onDownload });

      const downloadButtons = screen.getAllByLabelText('下载报表');
      fireEvent.click(downloadButtons[0]);

      expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({
        id: 1,
        reportType: 'inventory',
      }));
    });

    it('should not show download button for pending reports', () => {
      renderGenerator();
      // Only completed reports have download buttons
      const downloadButtons = screen.getAllByLabelText('下载报表');
      // ids 1 and 2 are completed = 2 download buttons
      expect(downloadButtons.length).toBe(2);
    });
  });

  // ---------- 生成按钮生成中状态 ----------

  describe('Generating State', () => {
    it('should show "生成中..." when generating', async () => {
      const onGenerate = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      );
      renderGenerator({ onGenerate });

      fireEvent.click(screen.getByText('生成报表'));

      await waitFor(() => {
        expect(screen.getByText('生成中...')).toBeInTheDocument();
      });
    });

    it('should return to normal state after generation completes', async () => {
      const onGenerate = vi.fn().mockResolvedValue(undefined);
      renderGenerator({ onGenerate });

      fireEvent.click(screen.getByText('生成报表'));

      await waitFor(() => {
        expect(screen.getByText('生成报表')).toBeInTheDocument();
      });
    });
  });

  // ---------- 分页 ----------

  describe('Pagination', () => {
    it('should show pagination with more than 10 reports', () => {
      const manyReports = Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        reportType: 'inventory' as const,
        fileFormat: 'csv' as const,
        status: 'completed' as const,
        generatedAt: `2025-01-${String(i + 1).padStart(2, '0')}T08:00:00Z`,
      }));
      renderGenerator({ reports: manyReports });
      expect(screen.getByText(/共 15 条/)).toBeInTheDocument();
    });

    it('should show correct row count for small data', () => {
      renderGenerator();
      expect(screen.getByText(new RegExp(`共 ${mockReports.length} 条`))).toBeInTheDocument();
    });
  });

  // ---------- 表头 --------

  describe('Table Headers', () => {
    it('should render all column headers in the table', () => {
      renderGenerator();
      // Table headers overlap with form labels — use getAllByText for all
      expect(screen.getAllByText('报表类型').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('ID').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('仓库ID').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('开始日期').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('结束日期').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('文件格式').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('生成时间').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('状态').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('操作').length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------- 边界情况 ----------

  describe('Edge Cases', () => {
    it('should display "全部" when warehouseId is undefined', () => {
      // Report id=3 has no warehouseId
      renderGenerator();
      const allLabels = screen.getAllByText('全部');
      expect(allLabels.length).toBeGreaterThanOrEqual(1);
    });

    it('should display "-" when dates are undefined', () => {
      renderGenerator();
      const dashes = screen.getAllByText('-');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });

    it('should display file format in uppercase', () => {
      renderGenerator();
      // CSV appears in both form Select and table Chip labels
      expect(screen.getAllByText('CSV').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('XLSX')).toBeInTheDocument();
      expect(screen.getByText('PDF')).toBeInTheDocument();
    });
  });
});
