/**
 * WmsAlertRuleEditor 组件单元测试
 *
 * 测试范围：
 * - 默认配置初始渲染
 * - API 加载已有配置
 * - 数值输入框变更（低库存/临期/呆滞天数）
 * - Switch 开关切换（启用/禁用各检查项）
 * - 预测配置字段（预测天数/短缺阈值/积压天数/最少数据天数）
 * - 预测关闭时子字段 disabled
 * - 保存配置 API 调用
 * - 保存失败错误处理
 * - 恢复默认设置
 * - Snackbar 保存成功状态
 * - 无效输入（NaN/负数）过滤
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import WmsAlertRuleEditor from '@/components/wms/WmsAlertRuleEditor';

// ===================== Mock 依赖 =====================

const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// ===================== 测试辅助 =====================

function renderEditor() {
  return render(<WmsAlertRuleEditor />);
}

function getTextInput(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function getSwitch(label: string): HTMLInputElement {
  const el = screen.getByLabelText(label);
  // MUI Switch renders as a checkbox with role="checkbox"
  return el.closest('input[type="checkbox"]') || (el as unknown as HTMLInputElement);
}

beforeEach(() => {
  mockShowToast.mockClear();
  vi.restoreAllMocks();
  // Default: API returns 404 (no saved config), so defaults are used
  vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===================== 测试用例 =====================

describe('WmsAlertRuleEditor', () => {
  // ---- 渲染测试 ----

  describe('Rendering', () => {
    it('should render the title', () => {
      renderEditor();
      expect(screen.getByText('WMS 预警规则配置')).toBeInTheDocument();
    });

    it('should render the description', () => {
      renderEditor();
      expect(screen.getByText(/配置库存预警的触发条件/)).toBeInTheDocument();
    });

    it('should render all three rule sections', () => {
      renderEditor();
      expect(screen.getByLabelText('启用低库存预警')).toBeInTheDocument();
      expect(screen.getByLabelText('启用临期预警')).toBeInTheDocument();
      expect(screen.getByLabelText('启用呆滞库存预警')).toBeInTheDocument();
    });

    it('should render prediction config section', () => {
      renderEditor();
      expect(screen.getByText('🧠 智能预测配置')).toBeInTheDocument();
      expect(screen.getByLabelText('启用智能预测')).toBeInTheDocument();
    });

    it('should render save and reset buttons', () => {
      renderEditor();
      expect(screen.getByText('保存配置')).toBeInTheDocument();
      expect(screen.getByText('恢复默认')).toBeInTheDocument();
    });
  });

  // ---- 默认值测试 ----

  describe('Default Values', () => {
    it('should show default lowStock value (10)', async () => {
      renderEditor();
      await waitFor(() => {
        const input = getTextInput('低库存阈值');
        expect(input.value).toBe('10');
      });
    });

    it('should show default expiryDays value (30)', () => {
      renderEditor();
      const input = getTextInput('临期天数');
      expect(input.value).toBe('30');
    });

    it('should show default stagnantDays value (90)', () => {
      renderEditor();
      const input = getTextInput('呆滞天数');
      expect(input.value).toBe('90');
    });

    it('should have all switches enabled by default', () => {
      renderEditor();
      expect(getSwitch('启用低库存预警').checked).toBe(true);
      expect(getSwitch('启用临期预警').checked).toBe(true);
      expect(getSwitch('启用呆滞库存预警').checked).toBe(true);
      expect(getSwitch('启用智能预测').checked).toBe(true);
    });

    it('should show default predictionDays (14)', () => {
      renderEditor();
      const input = getTextInput('预测天数');
      expect(input.value).toBe('14');
    });

    it('should show default shortageThreshold (10)', () => {
      renderEditor();
      const input = getTextInput('短缺阈值');
      expect(input.value).toBe('10');
    });

    it('should show default overstockDays (60)', () => {
      renderEditor();
      const input = getTextInput('积压天数');
      expect(input.value).toBe('60');
    });

    it('should show default minHistoryDays (7)', () => {
      renderEditor();
      const input = getTextInput('最少数据天数');
      expect(input.value).toBe('7');
    });
  });

  // ---- API 加载测试 ----

  describe('API Config Loading', () => {
    it('should load saved config from API on mount', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            lowStock: 5,
            expiryDays: 15,
            stagnantDays: 60,
            enableLowStock: false,
            enableExpiry: true,
            enableStagnant: true,
            enablePrediction: false,
            predictionDays: 7,
            shortageThreshold: 5,
            overstockDays: 30,
            minHistoryDays: 14,
          },
        }),
      } as Response);

      renderEditor();

      await waitFor(() => {
        expect(getTextInput('低库存阈值').value).toBe('5');
      });
      expect(getTextInput('临期天数').value).toBe('15');
      expect(getTextInput('呆滞天数').value).toBe('60');
      expect(getSwitch('启用低库存预警').checked).toBe(false);
    });

    it('should handle API returning data without wrapper', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          lowStock: 20,
          expiryDays: 45,
          stagnantDays: 120,
          enableLowStock: true,
          enableExpiry: true,
          enableStagnant: false,
          enablePrediction: true,
          predictionDays: 21,
          shortageThreshold: 15,
          overstockDays: 90,
          minHistoryDays: 10,
        }),
      } as Response);

      renderEditor();

      await waitFor(() => {
        expect(getTextInput('低库存阈值').value).toBe('20');
      });
      expect(getTextInput('临期天数').value).toBe('45');
      expect(getSwitch('启用呆滞库存预警').checked).toBe(false);
    });

    it('should use defaults when API returns !ok', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      } as Response);

      renderEditor();

      await waitFor(() => {
        expect(getTextInput('低库存阈值').value).toBe('10');
      });
    });

    it('should use defaults on network error', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      renderEditor();

      await waitFor(() => {
        expect(getTextInput('低库存阈值').value).toBe('10');
      });
    });

    it('should handle partial config from API (use defaults for missing fields)', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            lowStock: 8,
            // expiryDays omitted
            // stagnantDays omitted
          },
        }),
      } as Response);

      renderEditor();

      await waitFor(() => {
        expect(getTextInput('低库存阈值').value).toBe('8');
      });
      // Missing fields should use defaults
      expect(getTextInput('临期天数').value).toBe('30');
      expect(getTextInput('呆滞天数').value).toBe('90');
    });
  });

  // ---- 输入框变更测试 ----

  describe('Input Changes', () => {
    it('should update lowStock on input change', async () => {
      renderEditor();

      await waitFor(() => {
        expect(getTextInput('低库存阈值').value).toBe('10');
      });

      const input = getTextInput('低库存阈值');
      fireEvent.change(input, { target: { value: '25' } });
      expect(input.value).toBe('25');
    });

    it('should update expiryDays on input change', () => {
      renderEditor();

      const input = getTextInput('临期天数');
      fireEvent.change(input, { target: { value: '60' } });
      expect(input.value).toBe('60');
    });

    it('should update stagnantDays on input change', () => {
      renderEditor();

      const input = getTextInput('呆滞天数');
      fireEvent.change(input, { target: { value: '180' } });
      expect(input.value).toBe('180');
    });

    it('should ignore non-numeric input', () => {
      renderEditor();

      const input = getTextInput('低库存阈值');
      fireEvent.change(input, { target: { value: 'abc' } });
      // parseInt('abc') is NaN, so value stays unchanged
      expect(input.value).toBe('10');
    });

    it('should ignore negative input', () => {
      renderEditor();

      const input = getTextInput('低库存阈值');
      fireEvent.change(input, { target: { value: '-5' } });
      // parseInt('-5') = -5, which is < 0, so value stays unchanged
      expect(input.value).toBe('10');
    });

    it('should accept zero as valid input', () => {
      renderEditor();

      const input = getTextInput('低库存阈值');
      fireEvent.change(input, { target: { value: '0' } });
      expect(input.value).toBe('0');
    });

    it('should update predictionDays', () => {
      renderEditor();

      const input = getTextInput('预测天数');
      fireEvent.change(input, { target: { value: '30' } });
      expect(input.value).toBe('30');
    });

    it('should update shortageThreshold', () => {
      renderEditor();

      const input = getTextInput('短缺阈值');
      fireEvent.change(input, { target: { value: '20' } });
      expect(input.value).toBe('20');
    });

    it('should update overstockDays', () => {
      renderEditor();

      const input = getTextInput('积压天数');
      fireEvent.change(input, { target: { value: '45' } });
      expect(input.value).toBe('45');
    });

    it('should update minHistoryDays', () => {
      renderEditor();

      const input = getTextInput('最少数据天数');
      fireEvent.change(input, { target: { value: '14' } });
      expect(input.value).toBe('14');
    });
  });

  // ---- Switch 切换测试 ----

  describe('Switch Toggles', () => {
    it('should toggle enableLowStock', () => {
      renderEditor();

      const sw = getSwitch('启用低库存预警');
      expect(sw.checked).toBe(true);

      fireEvent.click(sw);
      expect(sw.checked).toBe(false);
    });

    it('should toggle enableExpiry', () => {
      renderEditor();

      const sw = getSwitch('启用临期预警');
      expect(sw.checked).toBe(true);

      fireEvent.click(sw);
      expect(sw.checked).toBe(false);
    });

    it('should toggle enableStagnant', () => {
      renderEditor();

      const sw = getSwitch('启用呆滞库存预警');
      expect(sw.checked).toBe(true);

      fireEvent.click(sw);
      expect(sw.checked).toBe(false);
    });

    it('should toggle enablePrediction', () => {
      renderEditor();

      const sw = getSwitch('启用智能预测');
      expect(sw.checked).toBe(true);

      fireEvent.click(sw);
      expect(sw.checked).toBe(false);
    });

    it('should disable lowStock input when enableLowStock is off', () => {
      renderEditor();

      const sw = getSwitch('启用低库存预警');
      fireEvent.click(sw);
      expect(sw.checked).toBe(false);

      const input = getTextInput('低库存阈值');
      expect(input.disabled).toBe(true);
    });

    it('should disable expiryDays input when enableExpiry is off', () => {
      renderEditor();

      const sw = getSwitch('启用临期预警');
      fireEvent.click(sw);

      const input = getTextInput('临期天数');
      expect(input.disabled).toBe(true);
    });

    it('should disable stagnantDays input when enableStagnant is off', () => {
      renderEditor();

      const sw = getSwitch('启用呆滞库存预警');
      fireEvent.click(sw);

      const input = getTextInput('呆滞天数');
      expect(input.disabled).toBe(true);
    });

    it('should disable prediction fields when enablePrediction is off', () => {
      renderEditor();

      const sw = getSwitch('启用智能预测');
      fireEvent.click(sw);
      expect(sw.checked).toBe(false);

      expect(getTextInput('预测天数').disabled).toBe(true);
      expect(getTextInput('短缺阈值').disabled).toBe(true);
      expect(getTextInput('积压天数').disabled).toBe(true);
      expect(getTextInput('最少数据天数').disabled).toBe(true);
    });
  });

  // ---- 保存测试 ----

  describe('Save Config', () => {
    it('should call POST API with config when save is clicked', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      renderEditor();

      await waitFor(() => {
        expect(getTextInput('低库存阈值').value).toBe('10');
      });

      // Clear the mount-time fetch call record
      mockFetch.mockClear();

      // Change a value
      fireEvent.change(getTextInput('低库存阈值'), { target: { value: '50' } });

      fireEvent.click(screen.getByText('保存配置'));

      await waitFor(() => {
        const callArgs = mockFetch.mock.calls.find(
          (call) => call[0] === '/api/wms/alerts/config' && (call[1] as RequestInit)?.method === 'POST'
        );
        expect(callArgs).toBeDefined();
      });

      // Verify the body contains the updated config
      const callArgs = mockFetch.mock.calls.find(
        (call) => call[0] === '/api/wms/alerts/config' && (call[1] as RequestInit)?.method === 'POST'
      );
      expect(callArgs).toBeDefined();
      const body = JSON.parse((callArgs![1] as RequestInit).body as string);
      expect(body.lowStock).toBe(50);
      expect(body.expiryDays).toBe(30); // unchanged
    });

    it('should show success toast on save', async () => {
      // mockResolvedValue returns the same response for all calls (mount + save)
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      renderEditor();

      await waitFor(() => {
        expect(screen.getByText('保存配置')).toBeInTheDocument();
      });

      mockShowToast.mockClear(); // clear toast from mount (if any)

      fireEvent.click(screen.getByText('保存配置'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('预警规则已保存', 'success');
      });
    });

    it('should show error toast on API error', async () => {
      vi.spyOn(global, 'fetch').mockImplementation((input, init) => {
        const method = (init as RequestInit)?.method;
        if (method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: async () => ({ error: '服务器错误' }),
          } as Response);
        }
        // Config load on mount: return default
        return Promise.resolve({
          ok: false,
          json: async () => ({}),
        } as Response);
      });

      renderEditor();

      await waitFor(() => {
        expect(screen.getByText('保存配置')).toBeInTheDocument();
      });

      mockShowToast.mockClear();

      fireEvent.click(screen.getByText('保存配置'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('保存失败'),
          'error'
        );
      });
    });

    it('should handle save network error gracefully', async () => {
      // Use mockImplementation to reject on POST but handle GET (config load)
      vi.spyOn(global, 'fetch').mockImplementation((input, init) => {
        const method = (init as RequestInit)?.method;
        if (method === 'POST') {
          return Promise.reject(new Error('Network failure'));
        }
        // GET for config load: return defaults
        return Promise.resolve({
          ok: false,
          json: async () => ({}),
        } as Response);
      });

      renderEditor();

      await waitFor(() => {
        expect(screen.getByText('保存配置')).toBeInTheDocument();
      });

      mockShowToast.mockClear();

      fireEvent.click(screen.getByText('保存配置'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('保存失败: Network failure', 'error');
      });
    });

    it('should set snackbar open on successful save', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      renderEditor();

      await waitFor(() => {
        expect(screen.getByText('保存配置')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('保存配置'));

      await waitFor(() => {
        expect(screen.getByText('配置已保存')).toBeInTheDocument();
      });
    });
  });

  // ---- 恢复默认测试 ----

  describe('Reset to Defaults', () => {
    it('should reset all fields to default values', async () => {
      renderEditor();

      await waitFor(() => {
        expect(getTextInput('低库存阈值').value).toBe('10');
      });

      // Change several fields
      fireEvent.change(getTextInput('低库存阈值'), { target: { value: '99' } });
      fireEvent.click(getSwitch('启用低库存预警'));

      expect(getTextInput('低库存阈值').value).toBe('99');
      expect(getSwitch('启用低库存预警').checked).toBe(false);

      // Click reset
      fireEvent.click(screen.getByText('恢复默认'));

      expect(getTextInput('低库存阈值').value).toBe('10');
      expect(getSwitch('启用低库存预警').checked).toBe(true);
    });

    it('should show info toast on reset', () => {
      renderEditor();

      fireEvent.click(screen.getByText('恢复默认'));

      expect(mockShowToast).toHaveBeenCalledWith('已恢复默认设置', 'info');
    });
  });

  // ---- 预测配置帮助文本测试 ----

  describe('Prediction Helpers', () => {
    it('should show prediction section header', () => {
      renderEditor();
      expect(screen.getByText('🧠 智能预测配置')).toBeInTheDocument();
    });

    it('should show prediction description', () => {
      renderEditor();
      expect(
        screen.getByText(/基于历史出库数据的 EMA 指数平滑预测/)
      ).toBeInTheDocument();
    });

    it('should show helper text for predictionDays', () => {
      renderEditor();
      expect(screen.getByText('预测未来 N 天的库存趋势')).toBeInTheDocument();
    });

    it('should show helper text for shortageThreshold', () => {
      renderEditor();
      expect(screen.getByText('预测库存 ≤ 此值时触发预警')).toBeInTheDocument();
    });

    it('should show helper text for overstockDays', () => {
      renderEditor();
      expect(
        screen.getByText('预测可消耗天数 > 此值时触发积压预警')
      ).toBeInTheDocument();
    });

    it('should show helper text for minHistoryDays', () => {
      renderEditor();
      expect(
        screen.getByText('需至少 N 天出库记录才参与预测')
      ).toBeInTheDocument();
    });
  });

  // ---- 边界条件测试 ----

  describe('Edge Cases', () => {
    it('should accept empty string (treated as unchanged via NaN guard)', () => {
      renderEditor();

      const input = getTextInput('低库存阈值');
      fireEvent.change(input, { target: { value: '' } });
      // Empty string → parseInt('') is NaN → ignored
      expect(input.value).toBe('10');
    });

    it('should handle multiple rapid input changes', () => {
      renderEditor();

      const input = getTextInput('低库存阈值');
      fireEvent.change(input, { target: { value: '5' } });
      fireEvent.change(input, { target: { value: '15' } });
      fireEvent.change(input, { target: { value: '25' } });
      expect(input.value).toBe('25');
    });

    it('should send full config including prediction fields on save', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      renderEditor();

      await waitFor(() => {
        expect(screen.getByText('保存配置')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('保存配置'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const callArgs = mockFetch.mock.calls.find(
        (call) => call[0] === '/api/wms/alerts/config' && (call[1] as RequestInit)?.method === 'POST'
      );
      const body = JSON.parse((callArgs![1] as RequestInit).body as string);

      // Verify all config fields are sent
      expect(body).toHaveProperty('lowStock', 10);
      expect(body).toHaveProperty('expiryDays', 30);
      expect(body).toHaveProperty('stagnantDays', 90);
      expect(body).toHaveProperty('enableLowStock', true);
      expect(body).toHaveProperty('enableExpiry', true);
      expect(body).toHaveProperty('enableStagnant', true);
      expect(body).toHaveProperty('enablePrediction', true);
      expect(body).toHaveProperty('predictionDays', 14);
      expect(body).toHaveProperty('shortageThreshold', 10);
      expect(body).toHaveProperty('overstockDays', 60);
      expect(body).toHaveProperty('minHistoryDays', 7);
    });

    it('should render all FormControlLabel sections', () => {
      renderEditor();
      // 4 switch sections
      const labels = [
        '启用低库存预警',
        '启用临期预警',
        '启用呆滞库存预警',
        '启用智能预测',
      ];
      labels.forEach((label) => {
        expect(screen.getByText(label)).toBeInTheDocument();
      });
    });
  });
});
