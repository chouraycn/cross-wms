/**
 * WMS 业务核心路径 @smoke E2E
 * 覆盖：库存查询、入库质检新建、出库复核扫描、预警筛选。
 * 所有接口请求使用 page.route 拦截返回假数据，避免依赖真实 SQLite 数据 — 重点验证
 *      "页面可开 → UI 元素可达 → 表单/筛选提交无 JS 报错"
 * 这一条主链路，防止回归导致业务页白屏或按钮点不动。
 *
 * 注意：本项目使用 HashRouter，路由需带 /#/ 前缀。
 *      PageHeader 使用 Typography variant="h5"，标题为 <h5>。
 */

import { test, expect } from '../helpers/fixtures';

/** 统一成功响应包裹（后端约定 { code: 0, data } ） */
const ok = (data: unknown) => ({ code: 0, msg: 'ok', data });

test.describe('WMS 业务 @smoke @wms', () => {
  test.beforeEach(async ({ page }) => {
    // ===== 库存相关（InventoryPage 通过 warehouseCapabilityStore 加载） =====
    // store.initFromApi 并行拉取 warehouses / transit / inventory
    await page.route('**/api/warehouses*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok([
          { id: 'wh-001', name: '深圳总仓', country: '中国', city: '深圳', totalVolume: 5000, usedVolume: 3200, totalItems: 5000, usedItems: 3200, status: 'normal', address: '深圳', manager: '张伟', phone: '', createdAt: '2022-01-15' },
          { id: 'wh-002', name: '洛杉矶仓', country: '美国', city: '洛杉矶', totalVolume: 3000, usedVolume: 2750, totalItems: 3000, usedItems: 2750, status: 'warning', address: 'LA', manager: 'David', phone: '', createdAt: '2022-06-20' },
        ])),
      }),
    );

    await page.route('**/api/transit-orders*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok([])) }),
    );

    await page.route('**/api/inventory-transactions*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok([])) }),
    );

    await page.route('**/api/inventory*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok([
          { id: 'inv-1', sku: 'SKU001', name: '蓝牙耳机', warehouseId: 'wh-001', quantity: 120, volumePerUnit: 0.02, totalVolume: 2.4, category: '电子产品', inboundDate: '2026-07-01', totalValue: 12000, supplierId: '', customerId: '' },
          { id: 'inv-2', sku: 'SKU002', name: '口红 3.5g', warehouseId: 'wh-002', quantity: 32, volumePerUnit: 0.01, totalVolume: 0.32, category: '美妆个护', inboundDate: '2026-06-15', totalValue: 3200, supplierId: '', customerId: '' },
        ])),
      }),
    );

    // ===== 入库质检 =====
    await page.route('**/api/wms/quality*', async (route, req) => {
      if (req.method() === 'POST') {
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(ok({ id: 3001, ...JSON.parse(req.postData() || '{}') })),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok([
          { id: 1001, warehouseId: 'wh-001', sku: 'SKU001', productName: '蓝牙耳机', batchNo: 'B001', expectedQuantity: 60, actualQuantity: 60, qualityStatus: 'qualified', inspector: '李四', checkTime: '2026-08-01 10:00', notes: '' },
        ])),
      });
    });

    // ===== 出库复核 =====
    await page.route('**/api/wms/outbound-review*', async (route, req) => {
      if (req.method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(ok({ id: 2001, scannedQuantity: 13 })),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok([
          { id: 2001, outboundOrderId: 'OUT-20260809-001', sku: 'SKU001', productName: '蓝牙耳机', expectedQuantity: 20, scannedQuantity: 12, reviewStatus: 'pending', reviewer: '', reviewTime: '', notes: '' },
        ])),
      });
    });

    // ===== 异常预警 =====
    await page.route('**/api/wms/alerts/prediction/dashboard*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(null)) }),
    );

    await page.route('**/api/wms/alerts/check*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ newAlerts: 0, predictedShortageAlerts: 0, predictedOverstockAlerts: 0 })) }),
    );

    await page.route('**/api/wms/alerts*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok([
          { id: 5001, alertType: 'low_stock', sku: 'SKU002', name: '口红 3.5g', warehouseId: 'wh-002', status: 'active', level: 'warning', threshold: 50, currentQty: 32, message: '低库存预警' },
          { id: 5002, alertType: 'expiry', sku: 'SKU003', name: '面霜 50ml', warehouseId: 'wh-001', status: 'active', level: 'danger', expireDate: '2026-10-15', message: '临期预警' },
          { id: 5003, alertType: 'stagnant', sku: 'SKU004', name: '护发素', warehouseId: 'wh-001', status: 'resolved', level: 'info', lastMoveDays: 180, message: '滞销预警' },
        ])),
      }),
    );
  });

  test('库存查询页：列表返回结果，筛选与导出按钮可达', async ({ page }) => {
    await page.goto('/#/inventory');
    await page.waitForLoadState('networkidle');

    // 页面标题（PageHeader 使用 h5）
    await expect(page.getByRole('heading', { name: /库存/, level: 5 })).toBeVisible({ timeout: 10000 });

    // 等待数据行显示（品名）
    await expect(page.getByText('蓝牙耳机').first()).toBeVisible({ timeout: 10000 });

    // 仓库筛选下拉（MUI Select，label="仓库"）
    const warehouseSelect = page.getByRole('button', { name: /仓库/ }).first();
    if (await warehouseSelect.isVisible()) {
      await warehouseSelect.click();
      // 选项中应出现 mock 仓库名
      const option = page.getByRole('option', { name: '深圳总仓' }).first();
      if (await option.isVisible()) {
        await option.click();
      } else {
        await page.keyboard.press('Escape');
      }
    }

    // SKU 搜索框（SearchInput placeholder="搜索SKU或品名..."）
    const searchInput = page.getByPlaceholder('搜索SKU或品名...');
    if (await searchInput.isVisible()) {
      await searchInput.fill('SKU001');
    }

    // 导出 CSV 按钮可达（防止点击报错）
    const exportBtn = page.getByRole('button', { name: /导出/ }).first();
    if (await exportBtn.isVisible()) {
      await expect(exportBtn).toBeEnabled();
    }
  });

  test('入库质检页：新增质检 → 提交返回成功', async ({ page }) => {
    await page.goto('/#/wms/quality');
    await page.waitForLoadState('networkidle');

    // 页面标题
    await expect(page.getByRole('heading', { name: /入库质检/, level: 5 })).toBeVisible({ timeout: 10000 });

    // 点击"新增质检"按钮打开表单弹窗
    const newBtn = page.getByRole('button', { name: '新增质检' });
    await expect(newBtn).toBeVisible({ timeout: 10000 });
    await newBtn.click();

    // 表单弹窗标题
    await expect(page.getByRole('heading', { name: '新增质检记录' })).toBeVisible({ timeout: 5000 });

    // 通过 label 填写表单字段（MUI TextField label 渲染为关联 input 的 label）
    await page.getByLabel('仓库ID').fill('WH-001');
    await page.getByLabel('SKU').fill('SKU007');
    await page.getByLabel('商品名称').fill('充电宝 20000mAh');
    await page.getByLabel('预期数量').fill('100');
    await page.getByLabel('实际数量').fill('98');

    // 捕获提交接口调用 — 断言已发起 POST /api/wms/quality
    const postPromise = page.waitForResponse(
      (resp) => /\/api\/wms\/quality/.test(resp.url()) && resp.request().method() === 'POST',
      { timeout: 15000 },
    );
    await page.getByRole('button', { name: '创建' }).click();
    const postResp = await postPromise;
    expect(postResp.ok()).toBe(true);
  });

  test('出库复核页：模拟扫描 → POST scan 成功', async ({ page }) => {
    await page.goto('/#/wms/outbound');
    await page.waitForLoadState('networkidle');

    // 页面标题
    await expect(page.getByRole('heading', { name: /出库复核/, level: 5 })).toBeVisible({ timeout: 10000 });

    // 等待数据行出现（出库单号）
    await expect(page.getByText('OUT-20260809-001').first()).toBeVisible({ timeout: 10000 });

    // 操作列的模拟扫描按钮（IconButton 带 Tooltip "模拟扫描 +1"）
    const scanBtn = page.locator('button[aria-label="模拟扫描 +1"]').first();
    const scanBtnFallback = page.getByRole('button').filter({ hasText: '' }).first();

    // 捕获 POST scan 请求
    const scanPromise = page.waitForResponse(
      (resp) => /\/api\/wms\/outbound-review\/.*\/scan/.test(resp.url()) && resp.request().method() === 'POST',
      { timeout: 15000 },
    );

    if (await scanBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await scanBtn.click();
    } else {
      // 兜底：点击第一个带 QrCodeScannerIcon 的按钮
      await scanBtnFallback.click();
    }

    const scanResp = await scanPromise;
    expect(scanResp.ok()).toBe(true);
  });

  test('异常预警页：选择低库存筛选 → 显示低库存条目', async ({ page }) => {
    await page.goto('/#/wms/alerts');
    await page.waitForLoadState('networkidle');

    // 页面标题
    await expect(page.getByRole('heading', { name: /异常预警/, level: 5 })).toBeVisible({ timeout: 10000 });

    // 预警类型下拉（MUI Select，label="预警类型"）
    const typeSelect = page.getByRole('button', { name: /预警类型/ }).first();
    await expect(typeSelect).toBeVisible({ timeout: 10000 });
    await typeSelect.click();

    // 选择"低库存"
    const lowStockOption = page.getByRole('option', { name: '低库存' }).first();
    await expect(lowStockOption).toBeVisible({ timeout: 5000 });
    await lowStockOption.click();

    // 断言出现低库存条目（口红 3.5g）
    await expect(page.getByText('口红 3.5g').first()).toBeVisible({ timeout: 10000 });
  });
});
