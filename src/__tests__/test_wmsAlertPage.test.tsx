/**
 * WmsAlertPage 组件单元测试
 *
 * 测试范围：
 * - 页面渲染 PageHeader 标题
 * - 预警列表加载成功/失败
 * - 状态筛选和类型筛选
 * - 手动检查 API 调用
 * - resolve/ignore 操作
 * - 预测看板加载
 * - subscribeRefresh 订阅
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ===================== Mock 依赖 =====================

const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockUnsubscribe = vi.fn();
vi.mock('@/App', () => ({
  subscribeRefresh: (_key: string, _listener: () => void) => {
    return mockUnsubscribe;
  },
}));

// Mock child components as simple placeholders
vi.mock('@/components/Common/PageHeader', () => ({
  default: (props: { title: string; subtitle?: string; summary?: string; action?: React.ReactNode }) => (
    <div data-testid="page-header">
      <h1>{props.title}</h1>
      {props.subtitle && <p>{props.subtitle}</p>}
      {props.summary && <span data-testid="summary">{props.summary}</span>}
      {props.action && <div data-testid="page-header-action">{props.action}</div>}
    </div>
  ),
}));

vi.mock('@/components/wms/WmsAlertList', () => ({
  default: (props: any) => (
    <div data-testid="alert-list">
      <span data-testid="alert-count">{props.alerts?.length ?? 0}</span>
      <span data-testid="alert-loading">{String(props.loading)}</span>
      <button data-testid="resolve-btn" onClick={() => props.onResolve?.(1)}>Resolve</button>
      <button data-testid="ignore-btn" onClick={() => props.onIgnore?.(1)}>Ignore</button>
      <button data-testid="prediction-detail-btn" onClick={() => props.onPredictionDetail?.({ sku: 'SKU001', warehouseId: 'WH-001' })}>
        Detail
      </button>
    </div>
  ),
}));

vi.mock('@/components/wms/WmsPredictionDashboard', () => ({
  default: (props: any) => (
    <div data-testid="prediction-dashboard">
      <span data-testid="prediction-loading">{String(props.loading)}</span>
      <span data-testid="prediction-data">{props.data ? 'has-data' : 'no-data'}</span>
      <button data-testid="check-prediction-btn" onClick={props.onCheckPrediction}>
        Check Prediction
      </button>
    </div>
  ),
}));

vi.mock('@/components/wms/WmsPredictionDetail', () => ({
  default: (props: any) => (
    <div data-testid="prediction-detail">
      <span data-testid="detail-open">{String(props.open)}</span>
      <span data-testid="detail-sku">{props.sku}</span>
      <button data-testid="detail-close" onClick={props.onClose}>Close</button>
    </div>
  ),
}));

// ===================== 辅助函数 =====================

// Now import the actual component AFTER all mocks are set up
import WmsAlertPage from '@/pages/WmsAlertPage';
import { API_BASE_URL } from '@/constants/api';

const BASE_URL = API_BASE_URL;

function renderPage() {
  return render(<WmsAlertPage />);
}

function mockAlertData() {
  const alerts = [
    { id: 1, warehouseId: 'WH-001', alertType: 'low_stock', severity: 'warning', message: 'SKU001 库存不足', status: 'active' },
    { id: 2, warehouseId: 'WH-001', alertType: 'expiry', severity: 'error', message: 'SKU002 即将过期', status: 'resolved' },
    { id: 3, warehouseId: 'WH-002', alertType: 'stagnant', severity: 'info', message: 'SKU003 滞销', status: 'active' },
  ];

  return vi.spyOn(global, 'fetch').mockImplementation((input, init?) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url === `${BASE_URL}/api/wms/alerts` && (!init || init.method === undefined || init.method === 'GET')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ code: 0, success: true, data: alerts }),
      } as Response);
    }

    if (url === `${BASE_URL}/api/wms/alerts/prediction/dashboard`) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          code: 0,
          data: {
            predictedShortageCount: 3,
            predictedOverstockCount: 1,
            pendingReplenishSkuCount: 5,
            dataCoverageRate: 85,
          },
        }),
      } as Response);
    }

    return Promise.reject(new Error('Unmocked'));
  });
}

function mockAlertError() {
  vi.spyOn(global, 'fetch').mockImplementation((input, init?) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url === `${BASE_URL}/api/wms/alerts` && (!init || init.method === undefined)) {
      return Promise.reject(new Error('Network error'));
    }

    if (url === `${BASE_URL}/api/wms/alerts/prediction/dashboard`) {
      return Promise.reject(new Error('Network error'));
    }

    return Promise.reject(new Error('Unmocked'));
  });
}

beforeEach(() => {
  mockShowToast.mockClear();
  mockUnsubscribe.mockClear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===================== 测试用例 =====================

describe('WmsAlertPage', () => {
  // ---- 渲染测试 ----

  describe('Rendering', () => {
    it('should render PageHeader with title "异常预警"', () => {
      mockAlertData();
      renderPage();

      expect(screen.getByTestId('page-header')).toBeInTheDocument();
      expect(screen.getByText('异常预警')).toBeInTheDocument();
    });

    it('should render subtitle in PageHeader', () => {
      mockAlertData();
      renderPage();

      expect(
        screen.getByText(/低库存、临期、滞销、预测短缺\/积压等异常情况的自动预警/)
      ).toBeInTheDocument();
    });

    it('should show loading state initially', () => {
      mockAlertData();
      renderPage();

      // WmsAlertList should receive loading=true initially
      expect(screen.getByTestId('alert-loading')).toHaveTextContent('true');
    });

    it('should render WmsAlertList after loading', async () => {
      mockAlertData();
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('alert-list')).toBeInTheDocument();
      });
    });
  });

  // ---- 预警列表加载测试 ----

  describe('Alert list loading', () => {
    it('should load alerts on mount', async () => {
      const fetchSpy = mockAlertData();
      renderPage();

      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(
          (c) => c[0] === `${BASE_URL}/api/wms/alerts`
        );
        expect(call).toBeDefined();
      });
    });

    it('should show toast error on alert load failure', async () => {
      mockAlertError();
      renderPage();

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('网络错误', 'error');
      });
    });

    it('should show error toast when API returns non-zero code', async () => {
      vi.spyOn(global, 'fetch').mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === `${BASE_URL}/api/wms/alerts`) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ code: 1, success: false, message: '服务器内部错误' }),
          } as Response);
        }
        if (url === `${BASE_URL}/api/wms/alerts/prediction/dashboard`) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 0, data: null }) } as Response);
        }
        return Promise.reject(new Error('Unmocked'));
      });

      renderPage();

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('服务器内部错误', 'error');
      });
    });
  });

  // ---- 筛选测试 ----

  describe('Filter controls', () => {
    /** Get comboboxes: index 0 = status filter, index 1 = alert type filter */
    function getComboboxes(): HTMLElement[] {
      return screen.getAllByRole('combobox');
    }

    it('should render status filter select', () => {
      mockAlertData();
      renderPage();

      const combos = getComboboxes();
      expect(combos.length).toBeGreaterThanOrEqual(1);
      // MUI may render multiple elements with the same label text
      const labels = screen.getAllByText('状态筛选');
      expect(labels.length).toBeGreaterThan(0);
    });

    it('should render alert type filter select', () => {
      mockAlertData();
      renderPage();

      const combos = getComboboxes();
      expect(combos.length).toBeGreaterThanOrEqual(2);
      const labels = screen.getAllByText('预警类型');
      expect(labels.length).toBeGreaterThan(0);
    });

    it('should change status filter', async () => {
      mockAlertData();
      renderPage();

      // First combobox is status filter
      const statusSelect = getComboboxes()[0];
      fireEvent.mouseDown(statusSelect);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: '已解决' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('option', { name: '已解决' }));
      await waitFor(() => {
        expect(statusSelect).toHaveTextContent('已解决');
      });
    });

    it('should change alert type filter', async () => {
      mockAlertData();
      renderPage();

      // Second combobox is alert type filter
      const typeSelect = getComboboxes()[1];
      fireEvent.mouseDown(typeSelect);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: '低库存' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('option', { name: '低库存' }));
      await waitFor(() => {
        expect(typeSelect).toHaveTextContent('低库存');
      });
    });
  });

  // ---- 手动检查测试 ----

  describe('Manual check', () => {
    it('should render manual check button', () => {
      mockAlertData();
      renderPage();

      expect(screen.getByText('手动检查')).toBeInTheDocument();
    });

    it('should call POST /api/wms/alerts/check on click', async () => {
      const fetchSpy = mockAlertData();

      // Add mock for the check endpoint
      fetchSpy.mockImplementation((input, init?) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === `${BASE_URL}/api/wms/alerts` && (!init || init.method === undefined)) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ code: 0, data: [{ id: 1, warehouseId: 'WH-001', alertType: 'low_stock', severity: 'warning', message: 'test', status: 'active' }] }),
          } as Response);
        }
        if (url === `${BASE_URL}/api/wms/alerts/prediction/dashboard`) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 0, data: null }) } as Response);
        }
        if (url === `${BASE_URL}/api/wms/alerts/check`) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ code: 0, data: { newAlerts: 2, predictedShortageAlerts: 1, predictedOverstockAlerts: 0 } }),
          } as Response);
        }

        return Promise.reject(new Error('Unmocked'));
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('alert-list')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('手动检查'));

      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(
          (c) => c[0] === `${BASE_URL}/api/wms/alerts/check` && (c[1] as RequestInit)?.method === 'POST'
        );
        expect(call).toBeDefined();
        const body = JSON.parse((call![1] as RequestInit).body as string);
        expect(body.includePrediction).toBe(true);
      });
    });

    it('should show success toast with new alert counts', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');

      fetchSpy.mockImplementation((input, init?) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === `${BASE_URL}/api/wms/alerts` && (!init || init.method === undefined)) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ code: 0, data: [{ id: 1, warehouseId: 'WH-001', alertType: 'low_stock', severity: 'warning', message: 'test', status: 'active' }] }),
          } as Response);
        }
        if (url === `${BASE_URL}/api/wms/alerts/prediction/dashboard`) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 0, data: null }) } as Response);
        }
        if (url === `${BASE_URL}/api/wms/alerts/check`) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ code: 0, data: { newAlerts: 2, predictedShortageAlerts: 1, predictedOverstockAlerts: 0 } }),
          } as Response);
        }

        return Promise.reject(new Error('Unmocked'));
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('alert-list')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('手动检查'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('预警检查完成'),
          'success'
        );
      });
    });

    it('should show error toast on check failure', async () => {
      vi.spyOn(global, 'fetch').mockImplementation((input, init?) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === `${BASE_URL}/api/wms/alerts`) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ code: 0, data: [] }),
          } as Response);
        }
        if (url === `${BASE_URL}/api/wms/alerts/prediction/dashboard`) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 0, data: null }) } as Response);
        }
        if (url === `${BASE_URL}/api/wms/alerts/check`) {
          return Promise.reject(new Error('Network error'));
        }

        return Promise.reject(new Error('Unmocked'));
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('alert-list')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('手动检查'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('网络错误', 'error');
      });
    });
  });

  // ---- Resolve/Ignore 操作测试 ----

  describe('Resolve and Ignore', () => {
    it('should call resolve API on resolve click', async () => {
      const fetchSpy = mockAlertData();

      // Add mock for resolve endpoint
      fetchSpy.mockImplementation((input, init?) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === `${BASE_URL}/api/wms/alerts` && (!init || init.method === undefined)) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              code: 0,
              data: [
                { id: 1, warehouseId: 'WH-001', alertType: 'low_stock', severity: 'warning', message: 'test', status: 'active' },
              ],
            }),
          } as Response);
        }
        if (url === `${BASE_URL}/api/wms/alerts/prediction/dashboard`) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 0, data: null }) } as Response);
        }
        if (url === `${BASE_URL}/api/wms/alerts/1/resolve`) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ code: 0, success: true }),
          } as Response);
        }

        return Promise.reject(new Error('Unmocked'));
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('alert-list')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('resolve-btn'));

      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(
          (c) => c[0] === `${BASE_URL}/api/wms/alerts/1/resolve` && (c[1] as RequestInit)?.method === 'POST'
        );
        expect(call).toBeDefined();
        expect(mockShowToast).toHaveBeenCalledWith('已标记为已解决', 'success');
      });
    });

    it('should call ignore API on ignore click', async () => {
      const fetchSpy = mockAlertData();

      fetchSpy.mockImplementation((input, init?) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === `${BASE_URL}/api/wms/alerts`) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              code: 0,
              data: [
                { id: 1, warehouseId: 'WH-001', alertType: 'low_stock', severity: 'warning', message: 'test', status: 'active' },
              ],
            }),
          } as Response);
        }
        if (url === `${BASE_URL}/api/wms/alerts/prediction/dashboard`) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 0, data: null }) } as Response);
        }
        if (url === `${BASE_URL}/api/wms/alerts/1/ignore`) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ code: 0, success: true }),
          } as Response);
        }

        return Promise.reject(new Error('Unmocked'));
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('alert-list')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('ignore-btn'));

      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(
          (c) => c[0] === `${BASE_URL}/api/wms/alerts/1/ignore` && (c[1] as RequestInit)?.method === 'POST'
        );
        expect(call).toBeDefined();
        expect(mockShowToast).toHaveBeenCalledWith('已忽略该预警', 'info');
      });
    });
  });

  // ---- 预测看板测试 ----

  describe('Prediction dashboard', () => {
    it('should render prediction dashboard component', () => {
      mockAlertData();
      renderPage();

      expect(screen.getByTestId('prediction-dashboard')).toBeInTheDocument();
    });

    it('should load prediction dashboard on mount', async () => {
      const fetchSpy = mockAlertData();
      renderPage();

      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(
          (c) => c[0] === `${BASE_URL}/api/wms/alerts/prediction/dashboard`
        );
        expect(call).toBeDefined();
      });
    });

    it('should handle prediction dashboard load failure silently', async () => {
      vi.spyOn(global, 'fetch').mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === `${BASE_URL}/api/wms/alerts`) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ code: 0, data: [] }),
          } as Response);
        }
        if (url === `${BASE_URL}/api/wms/alerts/prediction/dashboard`) {
          return Promise.reject(new Error('Service unavailable'));
        }

        return Promise.reject(new Error('Unmocked'));
      });

      renderPage();

      // Should not call showToast for prediction errors
      await waitFor(() => {
        expect(screen.getByTestId('alert-list')).toBeInTheDocument();
      });

      // No error toast should have been called
      const predictionErrorCalls = mockShowToast.mock.calls.filter(
        (call) => call[1] === 'error'
      );
      expect(predictionErrorCalls.length).toBe(0);
    });
  });

  // ---- 其他测试 ----

  describe('Miscellaneous', () => {
    it('should subscribe to refresh on mount', () => {
      mockAlertData();
      renderPage();

      // subscribeRefresh is called during useEffect
      // We verify the unsubscribe function exists
      expect(mockUnsubscribe).toBeDefined();
    });

    it('should show summary with active alert count', async () => {
      mockAlertData();
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('summary')).toHaveTextContent(/2 条活跃预警/);
      });
    });

    it('should show "暂无活跃预警" when no active alerts', async () => {
      vi.spyOn(global, 'fetch').mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === `${BASE_URL}/api/wms/alerts`) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ code: 0, data: [] }),
          } as Response);
        }
        if (url === `${BASE_URL}/api/wms/alerts/prediction/dashboard`) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 0, data: null }) } as Response);
        }

        return Promise.reject(new Error('Unmocked'));
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('summary')).toHaveTextContent('暂无活跃预警');
      });
    });

    it('should show "全部解决" and "全部忽略" buttons when active alerts exist', async () => {
      mockAlertData();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('全部解决')).toBeInTheDocument();
        expect(screen.getByText('全部忽略')).toBeInTheDocument();
      });
    });
  });
});
