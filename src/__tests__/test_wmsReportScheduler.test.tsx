/**
 * WmsReportScheduler 组件单元测试
 *
 * 测试范围：
 * - 渲染标题、描述文字
 * - 仓库列表加载成功/失败
 * - 表单控件交互（报表类型、仓库、频率、时间）
 * - 小时/分钟输入校验
 * - POST /api/automation 创建任务
 * - RRULE 格式验证
 * - 创建成功后表单重置
 * - loading 状态
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WmsReportScheduler from '@/components/wms/WmsReportScheduler';

// ===================== Mock 依赖 =====================

const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// ===================== 辅助函数 =====================

function renderScheduler() {
  return render(<WmsReportScheduler />);
}

/** Get report type select (first combobox) */
function getReportTypeSelect(): HTMLElement {
  const comboboxes = screen.getAllByRole('combobox');
  return comboboxes[0];
}

/** Get warehouse select (second combobox) */
function getWarehouseSelect(): HTMLElement {
  const comboboxes = screen.getAllByRole('combobox');
  return comboboxes[1];
}

/** Open a MUI Select and pick an option by text */
async function selectOption(selectEl: HTMLElement, optionText: string) {
  fireEvent.mouseDown(selectEl);
  await waitFor(() => {
    const option = screen.getByRole('option', { name: optionText });
    fireEvent.click(option);
  });
}

function setupFetch(handlers: Record<string, () => Promise<Response>>, fallbackReject = true) {
  return vi.spyOn(global, 'fetch').mockImplementation((input, init?) => {
    const url = typeof input === 'string' ? input : input.toString();
    // Check for exact match first, then check if any handler key matches as prefix
    if (handlers[url]) return handlers[url]();
    for (const [key, handler] of Object.entries(handlers)) {
      if (url.startsWith(key) || url.includes(key)) return handler();
    }
    if (fallbackReject) return Promise.reject(new Error(`Unmocked: ${url}`));
    return Promise.reject(new Error(`Unmocked: ${url}`));
  });
}

beforeEach(() => {
  mockShowToast.mockClear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===================== 测试用例 =====================

describe('WmsReportScheduler', () => {
  // ---- 渲染测试 ----

  describe('Rendering', () => {
    it('should render the title', () => {
      setupFetch({
        '/api/warehouses': () => Promise.reject(new Error('Network error')),
      });
      renderScheduler();
      expect(screen.getByText('创建报表定时任务')).toBeInTheDocument();
    });

    it('should render the description', () => {
      setupFetch({
        '/api/warehouses': () => Promise.reject(new Error('Network error')),
      });
      renderScheduler();
      expect(
        screen.getByText(/配置定期自动生成 WMS 报表，支持库存、入库、出库三类报表/)
      ).toBeInTheDocument();
    });

    it('should render report type select (first combobox)', () => {
      setupFetch({
        '/api/warehouses': () => Promise.reject(new Error('Network error')),
      });
      renderScheduler();
      expect(getReportTypeSelect()).toBeInTheDocument();
    });

    it('should render warehouse select (second combobox)', () => {
      setupFetch({
        '/api/warehouses': () => Promise.reject(new Error('Network error')),
      });
      renderScheduler();
      expect(getWarehouseSelect()).toBeInTheDocument();
    });

    it('should render frequency RadioGroup with DAILY default', () => {
      setupFetch({
        '/api/warehouses': () => Promise.reject(new Error('Network error')),
      });
      renderScheduler();
      expect(screen.getByText('调度频率')).toBeInTheDocument();
      const dailyRadio = screen.getByLabelText('每天') as HTMLInputElement;
      expect(dailyRadio.checked).toBe(true);
    });

    it('should render hour and minute inputs', () => {
      setupFetch({
        '/api/warehouses': () => Promise.reject(new Error('Network error')),
      });
      renderScheduler();
      expect(screen.getByLabelText('小时')).toBeInTheDocument();
      expect(screen.getByLabelText('分钟')).toBeInTheDocument();
    });

    it('should render create button', () => {
      setupFetch({
        '/api/warehouses': () => Promise.reject(new Error('Network error')),
      });
      renderScheduler();
      expect(screen.getByText('创建定时任务')).toBeInTheDocument();
    });
  });

  // ---- 仓库加载测试 ----

  describe('Warehouses loading', () => {
    it('should load and display warehouse options in select', async () => {
      setupFetch({
        '/api/warehouses': () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: [{ id: 'WH-001', name: '北京仓' }, { id: 'WH-002', name: '上海仓' }] }),
          } as Response),
      });
      renderScheduler();

      const warehouseSelect = getWarehouseSelect();
      fireEvent.mouseDown(warehouseSelect);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: '全部仓库' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '北京仓' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '上海仓' })).toBeInTheDocument();
      });
    });

    it('should show toast error when warehouses load fails', async () => {
      setupFetch({
        '/api/warehouses': () => Promise.reject(new Error('Network error')),
      });
      renderScheduler();

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('加载仓库列表失败', 'error');
      });
    });
  });

  // ---- 表单交互测试 ----

  describe('Form interactions', () => {
    it('should change report type to inbound', async () => {
      setupFetch({
        '/api/warehouses': () => Promise.reject(new Error('Network error')),
      });
      renderScheduler();

      await selectOption(getReportTypeSelect(), '入库报表');

      await waitFor(() => {
        expect(getReportTypeSelect()).toHaveTextContent('入库报表');
      });
    });

    it('should change report type to outbound', async () => {
      setupFetch({
        '/api/warehouses': () => Promise.reject(new Error('Network error')),
      });
      renderScheduler();

      await selectOption(getReportTypeSelect(), '出库报表');

      await waitFor(() => {
        expect(getReportTypeSelect()).toHaveTextContent('出库报表');
      });
    });

    it('should change warehouse selection', async () => {
      setupFetch({
        '/api/warehouses': () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: [{ id: 'WH-001', name: '北京仓' }] }),
          } as Response),
      });
      renderScheduler();

      // Wait for warehouse to load
      const warehouseSelect = getWarehouseSelect();
      fireEvent.mouseDown(warehouseSelect);
      await waitFor(() => {
        expect(screen.getByRole('option', { name: '北京仓' })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('option', { name: '北京仓' }));

      await waitFor(() => {
        expect(getWarehouseSelect()).toHaveTextContent('北京仓');
      });
    });

    it('should switch frequency from DAILY to WEEKLY', async () => {
      setupFetch({
        '/api/warehouses': () => Promise.reject(new Error('Network error')),
      });
      renderScheduler();

      const weeklyRadio = screen.getByLabelText('每周');
      fireEvent.click(weeklyRadio);

      await waitFor(() => {
        expect((weeklyRadio as HTMLInputElement).checked).toBe(true);
      });
    });

    it('should switch frequency to MONTHLY', async () => {
      setupFetch({
        '/api/warehouses': () => Promise.reject(new Error('Network error')),
      });
      renderScheduler();

      const monthlyRadio = screen.getByLabelText('每月');
      fireEvent.click(monthlyRadio);

      await waitFor(() => {
        expect((monthlyRadio as HTMLInputElement).checked).toBe(true);
      });
    });

    it('should change hour input to valid value', async () => {
      setupFetch({
        '/api/warehouses': () => Promise.reject(new Error('Network error')),
      });
      renderScheduler();

      const hourInput = screen.getByLabelText('小时') as HTMLInputElement;
      fireEvent.change(hourInput, { target: { value: '15' } });

      expect(hourInput.value).toBe('15');
    });

    it('should change minute input to valid value', async () => {
      setupFetch({
        '/api/warehouses': () => Promise.reject(new Error('Network error')),
      });
      renderScheduler();

      const minuteInput = screen.getByLabelText('分钟') as HTMLInputElement;
      fireEvent.change(minuteInput, { target: { value: '30' } });

      expect(minuteInput.value).toBe('30');
    });
  });

  // ---- 输入校验测试 ----

  describe('Input validation', () => {
    it('should reject hour value > 23 (reverts to default 9)', async () => {
      setupFetch({
        '/api/warehouses': () => Promise.reject(new Error('Network error')),
      });
      renderScheduler();

      const hourInput = screen.getByLabelText('小时') as HTMLInputElement;
      fireEvent.change(hourInput, { target: { value: '25' } });

      // Controlled component with validation - bad value is rejected, stays at 9
      expect(hourInput.value).toBe('9');
    });

    it('should reject hour value < 0', async () => {
      setupFetch({
        '/api/warehouses': () => Promise.reject(new Error('Network error')),
      });
      renderScheduler();

      const hourInput = screen.getByLabelText('小时') as HTMLInputElement;
      fireEvent.change(hourInput, { target: { value: '-1' } });

      expect(hourInput.value).toBe('9');
    });

    it('should reject minute value > 59', async () => {
      setupFetch({
        '/api/warehouses': () => Promise.reject(new Error('Network error')),
      });
      renderScheduler();

      const minuteInput = screen.getByLabelText('分钟') as HTMLInputElement;
      fireEvent.change(minuteInput, { target: { value: '60' } });

      expect(minuteInput.value).toBe('0');
    });

    it('should reject minute value < 0', async () => {
      setupFetch({
        '/api/warehouses': () => Promise.reject(new Error('Network error')),
      });
      renderScheduler();

      const minuteInput = screen.getByLabelText('分钟') as HTMLInputElement;
      fireEvent.change(minuteInput, { target: { value: '-5' } });

      expect(minuteInput.value).toBe('0');
    });
  });

  // ---- API 调用测试 ----

  describe('Create task API', () => {
    it('should POST to /api/automation on create with correct body', async () => {
      const fetchSpy = setupFetch({
        '/api/warehouses': () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: [{ id: 'WH-001', name: '北京仓' }] }),
          } as Response),
        '/api/automation': () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true }),
          } as Response),
      });

      renderScheduler();

      // Select report type
      await selectOption(getReportTypeSelect(), '库存报表');

      // Click create
      fireEvent.click(screen.getByText('创建定时任务'));

      await waitFor(() => {
        const calls = fetchSpy.mock.calls.filter(
          (call) => call[0] === '/api/automation'
        );
        expect(calls.length).toBe(1);
        const body = JSON.parse((calls[0][1] as RequestInit).body as string);
        expect(body.taskType).toBe('wms-report-gen');
        expect(body.scheduleType).toBe('recurring');
        expect(body.status).toBe('ACTIVE');
      });
    });

    it('should include correct RRULE in POST body with defaults', async () => {
      const fetchSpy = setupFetch({
        '/api/warehouses': () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: [{ id: 'WH-001', name: '北京仓' }] }),
          } as Response),
        '/api/automation': () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true }),
          } as Response),
      });

      renderScheduler();

      fireEvent.click(screen.getByText('创建定时任务'));

      await waitFor(() => {
        const calls = fetchSpy.mock.calls.filter(
          (call) => call[0] === '/api/automation'
        );
        expect(calls.length).toBe(1);
        const body = JSON.parse((calls[0][1] as RequestInit).body as string);
        expect(body.rrule).toBe('FREQ=DAILY;BYHOUR=9;BYMINUTE=0');
      });
    });

    it('should update RRULE when frequency changes to WEEKLY', async () => {
      const fetchSpy = setupFetch({
        '/api/warehouses': () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: [{ id: 'WH-001', name: '北京仓' }] }),
          } as Response),
        '/api/automation': () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true }),
          } as Response),
      });

      renderScheduler();

      fireEvent.click(screen.getByLabelText('每周'));
      fireEvent.click(screen.getByText('创建定时任务'));

      await waitFor(() => {
        const calls = fetchSpy.mock.calls.filter(
          (call) => call[0] === '/api/automation'
        );
        expect(calls.length).toBe(1);
        const body = JSON.parse((calls[0][1] as RequestInit).body as string);
        expect(body.rrule).toBe('FREQ=WEEKLY;BYHOUR=9;BYMINUTE=0');
      });
    });

    it('should update RRULE when hour changes', async () => {
      const fetchSpy = setupFetch({
        '/api/warehouses': () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: [{ id: 'WH-001', name: '北京仓' }] }),
          } as Response),
        '/api/automation': () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true }),
          } as Response),
      });

      renderScheduler();

      const hourInput = screen.getByLabelText('小时') as HTMLInputElement;
      fireEvent.change(hourInput, { target: { value: '14' } });
      fireEvent.click(screen.getByText('创建定时任务'));

      await waitFor(() => {
        const calls = fetchSpy.mock.calls.filter(
          (call) => call[0] === '/api/automation'
        );
        expect(calls.length).toBe(1);
        const body = JSON.parse((calls[0][1] as RequestInit).body as string);
        expect(body.rrule).toBe('FREQ=DAILY;BYHOUR=14;BYMINUTE=0');
      });
    });

    it('should show success toast and reset form on success', async () => {
      setupFetch({
        '/api/warehouses': () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: [{ id: 'WH-001', name: '北京仓' }] }),
          } as Response),
        '/api/automation': () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true }),
          } as Response),
      });
      renderScheduler();

      // Change hour so we can verify reset
      const hourInput = screen.getByLabelText('小时') as HTMLInputElement;
      fireEvent.change(hourInput, { target: { value: '14' } });

      fireEvent.click(screen.getByText('创建定时任务'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('报表定时任务已创建', 'success');
      });

      await waitFor(() => {
        expect((screen.getByLabelText('小时') as HTMLInputElement).value).toBe('9');
        expect((screen.getByLabelText('分钟') as HTMLInputElement).value).toBe('0');
      });
    });

    it('should show error toast on API failure', async () => {
      setupFetch({
        '/api/warehouses': () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: [{ id: 'WH-001', name: '北京仓' }] }),
          } as Response),
        '/api/automation': () =>
          Promise.resolve({
            ok: false,
            statusText: 'Internal Server Error',
            json: () => Promise.resolve({ error: 'Server error' }),
          } as Response),
      });

      renderScheduler();

      fireEvent.click(screen.getByText('创建定时任务'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('创建任务失败'),
          'error'
        );
      });
    });

    it('should show loading state while creating', async () => {
      let resolveAutomation: (value: Response) => void = () => {};
      setupFetch({
        '/api/warehouses': () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: [{ id: 'WH-001', name: '北京仓' }] }),
          } as Response),
        '/api/automation': () =>
          new Promise<Response>((resolve) => {
            resolveAutomation = resolve;
          }),
      });

      renderScheduler();

      fireEvent.click(screen.getByText('创建定时任务'));

      await waitFor(() => {
        expect(screen.getByText('创建中...')).toBeInTheDocument();
      });

      // Cleanup
      resolveAutomation({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);
    });
  });
});
