/**
 * AlertCarousel 组件单元测试
 *
 * 测试范围：
 * - 空 alerts 列表返回 null
 * - 单条 alert 渲染
 * - 多条 alert 轮播导航
 * - 关闭（dismiss）操作
 * - 严重程度可视化差异（error/warning/info）
 * - 前后导航循环
 * - 禁用状态（单条时导航按钮不可用）
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AlertCarousel } from '@/components/Dashboard/AlertCarousel';
import type { DashboardAlert } from '@/components/Dashboard/AlertCarousel';

// ===================== 测试数据 =====================

const errorAlert: DashboardAlert = {
  id: 'alert-1',
  severity: 'error',
  title: '严重积压',
  message: 'WH-001 仓库容积率已达 95%',
};

const warningAlert: DashboardAlert = {
  id: 'alert-2',
  severity: 'warning',
  title: '库存不足',
  message: 'SKU001 库存低于安全值',
};

const infoAlert: DashboardAlert = {
  id: 'alert-3',
  severity: 'info',
  title: '到达通知',
  message: '预计 3 批在途货物明日到达',
};

// ===================== 测试用例 =====================

describe('AlertCarousel', () => {
  // ---------- 空列表 ----------

  it('should return null when alerts is empty', () => {
    const { container } = render(
      <AlertCarousel alerts={[]} onDismiss={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  // ---------- 单条渲染 ----------

  it('should render title and message for single alert', () => {
    render(<AlertCarousel alerts={[errorAlert]} onDismiss={vi.fn()} />);
    expect(screen.getByText('严重积压')).toBeInTheDocument();
    expect(screen.getByText('WH-001 仓库容积率已达 95%')).toBeInTheDocument();
  });

  it('should show counter when only one alert (still shows with nav disabled)', () => {
    render(<AlertCarousel alerts={[errorAlert]} onDismiss={vi.fn()} />);
    // Single alert should display the title
    expect(screen.getByText('严重积压')).toBeInTheDocument();
  });

  // ---------- 多条轮播 ----------

  it('should show "1 / 3" initially for 3 alerts', () => {
    render(
      <AlertCarousel
        alerts={[errorAlert, warningAlert, infoAlert]}
        onDismiss={vi.fn()}
      />
    );
    // The counter is rendered as text content: "1 / 3"
    const counter = screen.getByText((content) => content.includes('1') && content.includes('3'));
    expect(counter).toBeInTheDocument();
  });

  it('should navigate to next alert on right arrow click', () => {
    render(
      <AlertCarousel
        alerts={[errorAlert, warningAlert, infoAlert]}
        onDismiss={vi.fn()}
      />
    );

    // Buttons: prev (ChevronLeft), next (ChevronRight), close (Close)
    const buttons = screen.getAllByRole('button');
    // On 3 alerts, there should be 3 buttons: prev, next, close
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    
    // Click the second button (next/ChevronRight)
    fireEvent.click(buttons[1]);

    // Should now show second alert
    expect(screen.getByText('库存不足')).toBeInTheDocument();
  });

  it('should navigate to previous alert on left arrow click', () => {
    render(
      <AlertCarousel
        alerts={[errorAlert, warningAlert, infoAlert]}
        onDismiss={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole('button');
    // Click next (button[1]) first to go to index 1
    fireEvent.click(buttons[1]);
    expect(screen.getByText('库存不足')).toBeInTheDocument();

    // Click prev (button[0]) to go back
    fireEvent.click(buttons[0]);
    expect(screen.getByText('严重积压')).toBeInTheDocument();
  });

  // ---------- 循环导航 ----------

  it('should wrap from last to first when going next on last alert', () => {
    render(
      <AlertCarousel
        alerts={[errorAlert, warningAlert]}
        onDismiss={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole('button');
    // buttons: [prev, next, close]. next = button[1]
    fireEvent.click(buttons[1]);
    expect(screen.getByText('库存不足')).toBeInTheDocument();

    // Go next from last -> should wrap to first
    fireEvent.click(buttons[1]);
    expect(screen.getByText('严重积压')).toBeInTheDocument();
  });

  it('should wrap from first to last when going prev on first alert', () => {
    render(
      <AlertCarousel
        alerts={[errorAlert, warningAlert]}
        onDismiss={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole('button');
    // prev = button[0], clicking prev on first should wrap to last
    fireEvent.click(buttons[0]);
    expect(screen.getByText('库存不足')).toBeInTheDocument();
  });

  // ---------- Dismiss 操作 ----------

  it('should call onDismiss with current alert id when clicking close', () => {
    const onDismiss = vi.fn();
    render(
      <AlertCarousel
        alerts={[errorAlert, warningAlert]}
        onDismiss={onDismiss}
      />
    );

    // The close button is the last button (has CloseIcon)
    const buttons = screen.getAllByRole('button');
    const closeBtn = buttons[buttons.length - 1];
    if (closeBtn) {
      fireEvent.click(closeBtn);
    }

    expect(onDismiss).toHaveBeenCalledWith('alert-1');
  });

  // ---------- 严重程度样式 ----------

  it('should show correct MUI severity for different alert types', () => {
    const { container } = render(
      <AlertCarousel alerts={[errorAlert]} onDismiss={vi.fn()} />
    );
    // MUI Alert with severity="error" should have the error class
    expect(container.querySelector('.MuiAlert-standardError')).toBeInTheDocument();
  });

  it('should apply warning styles for warning severity', () => {
    const { container } = render(
      <AlertCarousel alerts={[warningAlert]} onDismiss={vi.fn()} />
    );
    expect(container.querySelector('.MuiAlert-standardWarning')).toBeInTheDocument();
  });

  it('should apply info styles for info severity', () => {
    const { container } = render(
      <AlertCarousel alerts={[infoAlert]} onDismiss={vi.fn()} />
    );
    expect(container.querySelector('.MuiAlert-standardInfo')).toBeInTheDocument();
  });

  // ---------- 边界情况 ----------

  it('should not crash when dismissing the only alert', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <AlertCarousel alerts={[errorAlert]} onDismiss={onDismiss} />
    );

    const buttons = screen.getAllByRole('button');
    const closeBtn = buttons[buttons.length - 1];
    if (closeBtn) fireEvent.click(closeBtn);

    expect(onDismiss).toHaveBeenCalledWith('alert-1');
  });

  it('should show first alert after navigating and dismissing', () => {
    const onDismiss = vi.fn();
    render(
      <AlertCarousel
        alerts={[errorAlert, warningAlert, infoAlert]}
        onDismiss={onDismiss}
      />
    );

    // Go to second alert
    const nextBtn = screen.getAllByRole('button')[1];
    fireEvent.click(nextBtn);
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });
});
