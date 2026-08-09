/**
 * 设置弹窗 E2E 回归测试
 * 覆盖：侧边栏不应再显示"创作/系统"分组、
 *       设置弹窗内创作(5项)/系统(3项)分组跳转正确、
 *       弹窗滚到底后"关于"详情的返回/保存/重置/关闭按钮完整可见
 *
 * 选择器依据实际 DOM（SettingsPopover.tsx）：
 *   - 设置入口：侧边栏 ListItemButton，accessible name "设置"
 *   - 弹窗根容器：.settings-panel（MUI Popover paper 内的 Box）
 *   - 标题：菜单头 "CDF Know Claw"（注意拼写，关于详情页才是 "CDF Know Clow"）
 *   - 分组展开箭头：<svg class="sd1-icon sd1-icon-arrow">，并非 button
 *   - 叶子项：<div onClick>（非 button），通过文本定位点击
 *   - 详情页返回/关闭：IconButton 内含 aria-hidden 的 sd1-icon，无 accessible name，
 *     故用 button:has(.sd1-icon-arrow) / button:has(.sd1-icon-close) 定位
 *
 * 标签约定：
 *   @smoke — 构建前烟雾测试必跑
 *   @settings — 设置弹窗专项
 */

import { test, expect } from '../helpers/fixtures';
import type { Page, Locator } from '@playwright/test';

/** 点击侧边栏"设置"并等待弹窗挂载 */
async function openSettings(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: '设置' }).click();
  const panel = page.locator('.settings-panel').first();
  await expect(panel).toBeVisible({ timeout: 10000 });
  return panel;
}

/** 展开指定分组（按其 description 文本定位行，再点击行内箭头 svg） */
async function expandGroup(panel: Locator, description: string): Promise<void> {
  const arrow = panel
    .getByText(description, { exact: true })
    .locator('xpath=ancestor::div[descendant::svg[contains(@class,"sd1-icon-arrow")]][1]')
    .locator('.sd1-icon-arrow');
  await arrow.click();
}

test.describe('设置弹窗回归测试 @smoke @settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/chat');
    await page.waitForLoadState('networkidle');
  });

  test('侧边栏不应包含"创作"和"系统"两个分组（已迁移到设置弹窗）', async ({ page }) => {
    // 侧边栏 NavList 根 <ul role="list">
    const sidebarNav = page.getByRole('list').first();
    const navText = (await sidebarNav.textContent()) || '';

    expect(navText).not.toContain('创作');
    expect(navText).not.toContain('系统');

    // 正向校验：相邻分组仍在（防止整段误删）
    expect(navText).toContain('仓库员工');
    expect(navText).toContain('自动化');
  });

  test('点击侧边栏"设置"按钮应能打开设置弹窗', async ({ page }) => {
    await page.getByRole('button', { name: '设置' }).click();

    // 菜单头标题（实际拼写为 "CDF Know Claw"）与版本号
    await expect(page.getByText(/CDF Know Cl[ao]w/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/^v\d+\.\d+/)).toBeVisible();
  });

  test('设置弹窗-创作分组展开后5项均可点击跳转到对应路由', async ({ page }) => {
    const creationCases: Array<{ label: string; path: string }> = [
      { label: '图像生成', path: '/image-generation' },
      { label: '音乐生成', path: '/music-generation' },
      { label: '视频生成', path: '/video-generation' },
      { label: '媒体库', path: '/media-library' },
      { label: '媒体工具', path: '/media-tools' },
    ];

    for (const { label, path } of creationCases) {
      const panel = await openSettings(page);
      await expandGroup(panel, '图像 · 音乐 · 视频');

      // 叶子项是 <div onClick>，按精确文本定位并点击
      const leaf = panel.getByText(label, { exact: true });
      await expect(leaf).toBeVisible();
      await leaf.click();

      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain(path);
    }
  });

  test('设置弹窗-系统分组展开后3项均可点击跳转到对应路由', async ({ page }) => {
    const systemCases: Array<{ label: string; path: string }> = [
      { label: '语音合成', path: '/tts' },
      { label: '设备配对', path: '/pairing' },
      { label: '监控中心', path: '/monitoring' },
    ];

    for (const { label, path } of systemCases) {
      const panel = await openSettings(page);
      await expandGroup(panel, '设置 · 监控');

      const leaf = panel.getByText(label, { exact: true });
      await expect(leaf).toBeVisible();
      await leaf.click();

      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain(path);
    }
  });

  test('设置弹窗-关于详情页：返回/关闭/保存/重置按钮完整可见', async ({ page }) => {
    const panel = await openSettings(page);

    // 点击"关于"叶子项 → 切换到详情视图（不关闭弹窗）
    const aboutLeaf = panel.getByText('关于', { exact: true });
    await aboutLeaf.click();

    // 详情视图头部按钮：返回（sd1-icon-arrow）/ 关闭（sd1-icon-close）
    const backBtn = panel.locator('button').filter({ has: page.locator('.sd1-icon-arrow') });
    const closeBtn = panel.locator('button').filter({ has: page.locator('.sd1-icon-close') });
    // 底部操作按钮：重置 / 保存（真实 Button，有 accessible name）
    const saveBtn = panel.getByRole('button', { name: '保存' });
    const resetBtn = panel.getByRole('button', { name: '重置' });

    await expect(backBtn).toBeVisible();
    await expect(closeBtn).toBeVisible();

    // 滚动详情内容区到底部，使保存/重置进入视口
    const scrollContainer = saveBtn.locator('xpath=ancestor::div[contains(@style,"overflow")][1]');
    await scrollContainer.evaluate((el: HTMLElement) => {
      el.scrollTop = el.scrollHeight;
    });

    await expect(saveBtn).toBeInViewport();
    await expect(resetBtn).toBeInViewport();
    // 头部按钮在滚动容器外，始终可见
    await expect(backBtn).toBeInViewport();
    await expect(closeBtn).toBeInViewport();
  });
});
