/**
 * 扩展与工具页面端到端冒烟脚本
 * 覆盖：加载页面 / 统计卡片 / 表格列 / Search+Filter / Switch 启用禁用 /
 *       三点菜单 / 新增菜单 / 新建扩展表单 / 删除确认 / 截图归档
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'http://localhost:5173/#/extensions';
const SHOT_DIR = path.join(process.cwd(), 'e2e_screenshots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const now = () => new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

function step(title, fn) {
  return async (page, ctx) => {
    const start = Date.now();
    try {
      const r = await fn(page, ctx);
      const dur = Date.now() - start;
      results.push({ title, ok: true, duration: dur, detail: r ?? '' });
      console.log(`✔ ${title} (${dur}ms)`);
    } catch (err) {
      const dur = Date.now() - start;
      results.push({ title, ok: false, duration: dur, detail: String(err.message ?? err) });
      console.log(`✖ ${title} (${dur}ms) — ${err.message ?? err}`);
      const safeTitle = title.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 80);
      await page.screenshot({ path: path.join(SHOT_DIR, `FAIL_${safeTitle}.png`), fullPage: true }).catch(() => {});
    }
  };
}

const loadPage = step('打开扩展与工具页面', async (page) => {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('text=扩展和工具', { timeout: 30000 });
  await page.screenshot({ path: path.join(SHOT_DIR, '01_page_loaded.png'), fullPage: true });
  return 'OK';
});

const waitStats = step('等待统计卡片渲染', async (page) => {
  await page.waitForSelector('text=技能总数', { timeout: 20000 });
  const cards = await page.locator('text=/技能总数|已启用|草稿|已停用/').count();
  if (cards < 3) throw new Error(`统计卡片数量不足：${cards}`);
  return `cards=${cards}`;
});

const checkColumns = step('验证表头列：名称 / 描述 / 状态 / 操作', async (page) => {
  const headText = await page.locator('thead tr').first().innerText();
  const need = ['名称', '描述', '状态', '操作'];
  const missing = need.filter((n) => !headText.includes(n));
  const blocked = ['文件', '创建者', '更新时间'];
  const present = blocked.filter((n) => headText.includes(n));
  if (missing.length) throw new Error(`缺列: ${missing.join(',')}`);
  if (present.length) throw new Error(`仍存在已删除列：${present.join(',')}`);
  await page.screenshot({ path: path.join(SHOT_DIR, '02_table_header.png'), fullPage: true });
  return 'OK';
});

function moreBtnForRow(row) {
  // MoreVertIcon 按钮在 MUI 里通常 aria-label=undefined，使用图标容器定位
  return row.locator('button:has(svg[data-testid="MoreVertIcon"])').first();
}

const captureFirstRow = step('首行：名称 Kind Chip + 描述 + 状态 Chip + Switch', async (page) => {
  const row = page.locator('tbody tr').first();
  const count = await row.count();
  if (!count) return '无数据行，跳过';
  const switchEl = row.locator('input[type="checkbox"].PrivateSwitchBase-input').first();
  const switchCount = await switchEl.count();
  const moreBtn = moreBtnForRow(row);
  const moreCount = await moreBtn.count();
  if (switchCount === 0) throw new Error('首行未找到 Switch');
  if (moreCount === 0) throw new Error('首行未找到三点菜单');
  await page.screenshot({ path: path.join(SHOT_DIR, '03_first_row.png'), fullPage: true });
  return `switch=${switchCount} moreBtn=${moreCount}`;
});

const searchFilter = step('搜索框 + 状态下拉可用', async (page) => {
  const search = page.locator('input[placeholder*="搜索"]').first();
  const statusSel = page.locator('[role="combobox"]').first();
  const ok = (await search.count()) + (await statusSel.count()) >= 2;
  if (!ok) throw new Error('筛选控件不全');
  await search.fill('wms');
  await sleep(500);
  await page.screenshot({ path: path.join(SHOT_DIR, '04_search_wms.png'), fullPage: true });
  await search.fill('');
  return 'OK';
});

const switchToggle = step('Switch 启用/禁用切换', async (page) => {
  const row = page.locator('tbody tr').first();
  if (!(await row.count())) return '无数据行，跳过';
  const switchEl = row.locator('input[type="checkbox"].PrivateSwitchBase-input').first();
  const before = (await switchEl.isChecked()) ? 'on' : 'off';
  const track = row.locator('.MuiSwitch-track').first();
  const box = await track.boundingBox();
  if (box) {
    // 点击轨道右边来切换
    await track.click({ position: { x: box.width - 6, y: box.height / 2 }, force: true });
  } else {
    await switchEl.click({ force: true });
  }
  await sleep(1200);
  const after = (await switchEl.isChecked()) ? 'on' : 'off';
  if (before === after) throw new Error(`Switch 未切换：before=${before} after=${after}`);
  await page.screenshot({ path: path.join(SHOT_DIR, `05_switch_${before}->${after}.png`), fullPage: true });
  // 再切回来
  if (box) {
    await track.click({ position: { x: box.width - 6, y: box.height / 2 }, force: true });
  } else {
    await switchEl.click({ force: true });
  }
  await sleep(1200);
  return `${before} -> ${after}`;
});

const rowMenu = step('三点菜单打开 / Esc 关闭', async (page) => {
  const row = page.locator('tbody tr').first();
  if (!(await row.count())) return '无数据行，跳过';
  const moreBtn = moreBtnForRow(row);
  await moreBtn.click();
  await page.waitForSelector('text=/查看详情|复制 ID|删除|编辑/', { timeout: 5000 });
  await page.screenshot({ path: path.join(SHOT_DIR, '06_menu_open.png') });
  await page.keyboard.press('Escape');
  await sleep(400);
  return 'OK';
});

const addDropdown = step('新增按钮下拉：新建扩展 / 从发现列表加载', async (page) => {
  const addBtn = page.getByRole('button', { name: /新增/ }).first();
  await addBtn.click();
  await page.waitForSelector('text=/新建扩展|从发现列表加载/', { timeout: 5000 });
  await page.screenshot({ path: path.join(SHOT_DIR, '07_add_dropdown.png') });
  await page.keyboard.press('Escape');
  await sleep(400);
  return 'OK';
});

const createForm = step('新建扩展弹窗：表单渲染 / 校验 / 提交后出现在列表，再删除', async (page) => {
  // 重置状态：搜索框先 blur
  await page.keyboard.press('Escape');
  await sleep(300);
  // 打开弹窗
  const addBtn = page.getByRole('button').filter({ hasText: '新增' }).first();
  await addBtn.click();
  const newItem = page.getByText('新建扩展').first();
  await newItem.click();
  await page.waitForSelector('text=/扩展 ID/');
  await page.screenshot({ path: path.join(SHOT_DIR, '08_create_dialog.png') });
  // 不填校验
  await page.getByRole('button').filter({ hasText: /^创建$/ }).first().click();
  await sleep(800);
  const idInput = page.getByLabel(/扩展 ID/);
  const nameInput = page.getByLabel(/扩展名称/);
  await idInput.fill('smoke-my-tool');
  await nameInput.fill('冒烟测试工具');
  // 描述 textarea 使用 placeholder 匹配或定位到第 3 个输入
  const descArea = page.getByLabel(/描述/);
  if (await descArea.count()) {
    await descArea.fill('来自 Playwright 冒烟测试的临时扩展');
  } else {
    const ta = page.locator('textarea').first();
    if (await ta.count()) await ta.fill('来自 Playwright 冒烟测试的临时扩展');
  }
  // 提交
  await page.getByRole('button').filter({ hasText: /^创建$/ }).first().click();
  await sleep(2500);
  // 查列表里是否有
  const row = page.locator('tbody tr', { hasText: 'smoke-my-tool' }).first();
  const visible = await row.isVisible({ timeout: 4000 }).catch(() => false);
  if (!visible) throw new Error('新建的 smoke-my-tool 未出现在列表');
  await page.screenshot({ path: path.join(SHOT_DIR, '09_created_in_list.png'), fullPage: true });
  // 删除
  const moreBtn = moreBtnForRow(row);
  await moreBtn.click();
  await page.getByText('删除').first().click();
  await page.waitForSelector('text=确认删除', { timeout: 5000 });
  await page.screenshot({ path: path.join(SHOT_DIR, '10_delete_confirm.png') });
  await page.getByRole('button').filter({ hasText: /确认删除/ }).first().click();
  await sleep(2000);
  const stillExist = await page
    .locator('tbody tr', { hasText: 'smoke-my-tool' })
    .first()
    .isVisible({ timeout: 1000 })
    .catch(() => false);
  if (stillExist) throw new Error('删除后 smoke-my-tool 仍在列表');
  await page.screenshot({ path: path.join(SHOT_DIR, '11_deleted.png'), fullPage: true });
  return 'OK';
});

const toastVerify = step('错误提示 / Toast 检查', async (page) => {
  // 打开创建对话框，提交空表单，确认错误文案显示
  await page.keyboard.press('Escape');
  await sleep(300);
  const addBtn = page.getByRole('button').filter({ hasText: '新增' }).first();
  await addBtn.click();
  await page.getByText('新建扩展').first().click();
  await page.waitForSelector('text=/扩展 ID/');
  // 清空并点创建
  const idInput = page.getByLabel(/扩展 ID/);
  const nameInput = page.getByLabel(/扩展名称/);
  await idInput.fill('');
  await nameInput.fill('');
  await page.getByRole('button').filter({ hasText: /^创建$/ }).first().click();
  await sleep(1000);
  // 错误文案：取整个 dialog 文本
  const containerText = await page.locator('[role="dialog"]').first().innerText().catch(() => '');
  const idErr = containerText.includes('请输入有效的扩展 ID');
  const nameErr = containerText.includes('请输入扩展名称');
  // 取消
  await page.getByRole('button').filter({ hasText: /取消/ }).first().click();
  await sleep(300);
  if (!idErr || !nameErr) throw new Error(`表单校验未触发：idErr=${idErr} nameErr=${nameErr}`);
  return 'OK';
});

(async () => {
  console.log(`[${now()}] 启动 Playwright 冒烟测试 — ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(25000);

  for (const fn of [loadPage, waitStats, checkColumns, captureFirstRow, searchFilter, switchToggle, rowMenu, addDropdown, createForm, toastVerify]) {
    await fn(page, {});
  }

  await browser.close();

  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = total - passed;
  console.log('\n===== 冒烟测试汇总 =====');
  console.log(`共 ${total} 项  ✔ ${passed}  ✖ ${failed}`);
  results.forEach((r) => console.log(`${r.ok ? '✔' : '✖'} ${r.title} — ${r.detail} (${r.duration}ms)`));
  console.log(`截图归档: ${SHOT_DIR}`);

  const reportPath = path.join(SHOT_DIR, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: now(), results, summary: { total, passed, failed } }, null, 2));
  console.log(`JSON 报告: ${reportPath}`);

  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(2);
});
