// 库存预警插件
// 提供低库存、超储、临期商品检查与阈值配置能力

const DAY_MS = 24 * 60 * 60 * 1000;

const plugin = {
  /**
   * 工具执行入口
   * @param {string} toolName - 工具名称
   * @param {Record<string, any>} args - 工具参数
   * @returns {Promise<{success: boolean, data?: any, error?: string}>}
   */
  async execute(toolName, args) {
    switch (toolName) {
      case 'check_low_stock':
        return this.checkLowStock(args || {});
      case 'check_overstock':
        return this.checkOverstock(args || {});
      case 'check_expiring':
        return this.checkExpiring(args || {});
      case 'set_alert_threshold':
        return this.setAlertThreshold(args || {});
      default:
        return { success: false, error: `未知工具: ${toolName}` };
    }
  },

  /**
   * 检查低库存商品
   * - 若传入 threshold，统一使用该阈值
   * - 否则使用各 SKU 配置的 safetyStock
   */
  async checkLowStock(args) {
    const { warehouse, threshold } = args;
    const stocks = this.getStockLevels(warehouse);

    const alerts = stocks
      .filter((s) => {
        const limit = typeof threshold === 'number' ? threshold : s.safetyStock;
        return s.quantity <= limit;
      })
      .map((s) => ({
        sku: s.sku,
        name: s.name,
        warehouse: s.warehouse,
        quantity: s.quantity,
        safetyStock: s.safetyStock,
        shortage: Math.max(0, s.safetyStock - s.quantity),
        severity: s.quantity === 0 ? 'critical' : 'warning',
      }));

    return {
      success: true,
      data: {
        warehouse: warehouse || 'ALL',
        threshold: typeof threshold === 'number' ? threshold : null,
        alertCount: alerts.length,
        criticalCount: alerts.filter((a) => a.severity === 'critical').length,
        warningCount: alerts.filter((a) => a.severity === 'warning').length,
        alerts,
        checkedAt: new Date().toISOString(),
      },
    };
  },

  /**
   * 检查超储商品
   * 当前库存 / 最大库存 > capacityRatio 视为超储
   */
  async checkOverstock(args) {
    const { warehouse, capacityRatio = 1.0 } = args;
    const stocks = this.getStockLevels(warehouse);

    const alerts = stocks
      .filter((s) => s.maxStock > 0 && s.quantity / s.maxStock > capacityRatio)
      .map((s) => ({
        sku: s.sku,
        name: s.name,
        warehouse: s.warehouse,
        quantity: s.quantity,
        maxStock: s.maxStock,
        overflow: s.quantity - s.maxStock,
        ratio: Number((s.quantity / s.maxStock).toFixed(2)),
      }));

    return {
      success: true,
      data: {
        warehouse: warehouse || 'ALL',
        capacityRatio,
        alertCount: alerts.length,
        alerts,
        checkedAt: new Date().toISOString(),
      },
    };
  },

  /**
   * 检查临期商品
   * 返回在 daysAhead 天内将过期的库存批次
   */
  async checkExpiring(args) {
    const { daysAhead = 7, warehouse } = args;
    const now = Date.now();
    const deadline = now + daysAhead * DAY_MS;

    const batches = this.getExpiryBatches(warehouse);
    const alerts = batches
      .filter((b) => b.expiryAt <= deadline && b.expiryAt >= now)
      .map((b) => {
        const daysLeft = Math.ceil((b.expiryAt - now) / DAY_MS);
        return {
          ...b,
          expiryDate: new Date(b.expiryAt).toISOString().slice(0, 10),
          daysLeft,
          severity: daysLeft <= 2 ? 'critical' : 'warning',
        };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);

    // 同时返回已过期商品
    const expired = batches
      .filter((b) => b.expiryAt < now)
      .map((b) => ({
        ...b,
        expiryDate: new Date(b.expiryAt).toISOString().slice(0, 10),
        daysOverdue: Math.ceil((now - b.expiryAt) / DAY_MS),
      }));

    return {
      success: true,
      data: {
        warehouse: warehouse || 'ALL',
        daysAhead,
        expiringCount: alerts.length,
        expiring: alerts,
        expiredCount: expired.length,
        expired,
        checkedAt: new Date().toISOString(),
      },
    };
  },

  /**
   * 设置 SKU 的预警阈值
   * 此操作为 confirm 风险等级，调用方需用户确认
   */
  async setAlertThreshold(args) {
    const { sku, safetyStock, maxStock } = args;
    if (!sku) {
      return { success: false, error: 'sku 不能为空' };
    }

    const thresholds = this.getThresholdStore();
    const prev = thresholds.get(sku) || { safetyStock: 0, maxStock: 0 };
    const next = {
      sku,
      safetyStock: typeof safetyStock === 'number' ? safetyStock : prev.safetyStock,
      maxStock: typeof maxStock === 'number' ? maxStock : prev.maxStock,
      updatedAt: new Date().toISOString(),
    };
    thresholds.set(sku, next);

    return {
      success: true,
      data: {
        previous: prev,
        current: next,
      },
    };
  },

  // ========== 内部数据访问（模拟） ==========

  /**
   * 获取库存水平（含阈值配置）
   * 实际场景应连接 WMS 库存表查询
   */
  getStockLevels(warehouse) {
    const all = [
      { sku: 'SKU-0001', name: '商品 A', warehouse: 'WH-MAIN', quantity: 5, safetyStock: 50, maxStock: 200 },
      { sku: 'SKU-0002', name: '商品 B', warehouse: 'WH-MAIN', quantity: 80, safetyStock: 30, maxStock: 100 },
      { sku: 'SKU-0003', name: '商品 C', warehouse: 'WH-WEST', quantity: 0, safetyStock: 40, maxStock: 150 },
      { sku: 'SKU-0004', name: '商品 D', warehouse: 'WH-WEST', quantity: 220, safetyStock: 60, maxStock: 180 },
      { sku: 'SKU-0005', name: '商品 E', warehouse: 'WH-MAIN', quantity: 15, safetyStock: 20, maxStock: 80 },
    ];
    return warehouse ? all.filter((s) => s.warehouse === warehouse) : all;
  },

  /**
   * 获取含过期时间的库存批次
   */
  getExpiryBatches(warehouse) {
    const now = Date.now();
    const all = [
      { sku: 'SKU-0003', name: '商品 C', warehouse: 'WH-WEST', batch: 'B20250601', quantity: 30, expiryAt: now + 2 * DAY_MS },
      { sku: 'SKU-0005', name: '商品 E', warehouse: 'WH-MAIN', batch: 'B20250615', quantity: 10, expiryAt: now + 5 * DAY_MS },
      { sku: 'SKU-0003', name: '商品 C', warehouse: 'WH-WEST', batch: 'B20250520', quantity: 12, expiryAt: now - 3 * DAY_MS },
      { sku: 'SKU-0001', name: '商品 A', warehouse: 'WH-MAIN', batch: 'B20250625', quantity: 8, expiryAt: now + 20 * DAY_MS },
    ];
    return warehouse ? all.filter((b) => b.warehouse === warehouse) : all;
  },

  /**
   * 阈值存储（进程内 Map，仅用于演示）
   * 实际场景应持久化到数据库或配置中心
   */
  getThresholdStore() {
    if (!this._thresholds) {
      this._thresholds = new Map();
    }
    return this._thresholds;
  },

  activate() {
    console.log('[inventory-alert-plugin] 插件已激活');
  },

  deactivate() {
    console.log('[inventory-alert-plugin] 插件已停用');
  },

  info() {
    return {
      name: '库存预警',
      version: '1.0.0',
      description: '提供低库存、超储、临期商品检查与阈值配置能力',
    };
  },
};

module.exports = plugin;
