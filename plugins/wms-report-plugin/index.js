// WMS 报表生成插件
// 提供库存报表、出入库流水报表、库存周转报表的生成能力

const plugin = {
  /**
   * 工具执行入口
   * @param {string} toolName - 工具名称
   * @param {Record<string, any>} args - 工具参数
   * @returns {Promise<{success: boolean, data?: any, error?: string}>}
   */
  async execute(toolName, args) {
    switch (toolName) {
      case 'generate_inventory_report':
        return this.generateInventoryReport(args || {});
      case 'generate_transaction_report':
        return this.generateTransactionReport(args || {});
      case 'generate_turnover_report':
        return this.generateTurnoverReport(args || {});
      default:
        return { success: false, error: `未知工具: ${toolName}` };
    }
  },

  /**
   * 生成库存报表
   * 按 仓库/分类 聚合库存数量与金额
   */
  async generateInventoryReport(args) {
    const { warehouse, category, format = 'summary' } = args;

    // 模拟数据 —— 实际场景应连接 WMS 数据库查询
    const allItems = [
      { sku: 'SKU-0001', name: '商品 A', warehouse: 'WH-MAIN', category: '电子', quantity: 120, unitPrice: 25.5 },
      { sku: 'SKU-0002', name: '商品 B', warehouse: 'WH-MAIN', category: '电子', quantity: 80, unitPrice: 12.0 },
      { sku: 'SKU-0003', name: '商品 C', warehouse: 'WH-WEST', category: '食品', quantity: 200, unitPrice: 5.8 },
      { sku: 'SKU-0004', name: '商品 D', warehouse: 'WH-WEST', category: '食品', quantity: 45, unitPrice: 18.0 },
      { sku: 'SKU-0005', name: '商品 E', warehouse: 'WH-MAIN', category: '日用', quantity: 60, unitPrice: 8.5 },
    ];

    let items = allItems.slice();
    if (warehouse) items = items.filter((i) => i.warehouse === warehouse);
    if (category) items = items.filter((i) => i.category === category);

    if (format === 'detail') {
      const details = items.map((i) => ({
        sku: i.sku,
        name: i.name,
        warehouse: i.warehouse,
        category: i.category,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalValue: Number((i.quantity * i.unitPrice).toFixed(2)),
      }));
      return {
        success: true,
        data: {
          format: 'detail',
          count: details.length,
          items: details,
          generatedAt: new Date().toISOString(),
        },
      };
    }

    // summary 聚合
    const summary = {};
    for (const i of items) {
      const key = `${i.warehouse}/${i.category}`;
      if (!summary[key]) {
        summary[key] = { warehouse: i.warehouse, category: i.category, quantity: 0, totalValue: 0 };
      }
      summary[key].quantity += i.quantity;
      summary[key].totalValue = Number((summary[key].totalValue + i.quantity * i.unitPrice).toFixed(2));
    }
    const rows = Object.values(summary);
    const totalQuantity = rows.reduce((s, r) => s + r.quantity, 0);
    const totalValue = Number(rows.reduce((s, r) => s + r.totalValue, 0).toFixed(2));

    return {
      success: true,
      data: {
        format: 'summary',
        warehouse: warehouse || 'ALL',
        category: category || 'ALL',
        groups: rows,
        totalQuantity,
        totalValue,
        generatedAt: new Date().toISOString(),
      },
    };
  },

  /**
   * 生成出入库流水报表
   */
  async generateTransactionReport(args) {
    const { startDate, endDate, type = 'all' } = args;
    if (!startDate || !endDate) {
      return { success: false, error: 'startDate 与 endDate 为必填项' };
    }

    const startMs = Date.parse(startDate);
    const endMs = Date.parse(endDate);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      return { success: false, error: '日期格式无效，应为 YYYY-MM-DD' };
    }
    if (startMs > endMs) {
      return { success: false, error: 'startDate 不能晚于 endDate' };
    }

    // 模拟流水数据
    const allTxns = [
      { id: 'TX-1001', type: 'inbound', sku: 'SKU-0001', quantity: 50, warehouse: 'WH-MAIN', timestamp: startMs + 86400000 },
      { id: 'TX-1002', type: 'outbound', sku: 'SKU-0003', quantity: 30, warehouse: 'WH-WEST', timestamp: startMs + 2 * 86400000 },
      { id: 'TX-1003', type: 'inbound', sku: 'SKU-0002', quantity: 20, warehouse: 'WH-MAIN', timestamp: startMs + 3 * 86400000 },
      { id: 'TX-1004', type: 'outbound', sku: 'SKU-0005', quantity: 15, warehouse: 'WH-MAIN', timestamp: startMs + 4 * 86400000 },
    ];

    let txns = allTxns.filter((t) => t.timestamp >= startMs && t.timestamp <= endMs + 86400000);
    if (type !== 'all') txns = txns.filter((t) => t.type === type);

    const inboundCount = txns.filter((t) => t.type === 'inbound').length;
    const outboundCount = txns.filter((t) => t.type === 'outbound').length;
    const inboundQty = txns.filter((t) => t.type === 'inbound').reduce((s, t) => s + t.quantity, 0);
    const outboundQty = txns.filter((t) => t.type === 'outbound').reduce((s, t) => s + t.quantity, 0);

    return {
      success: true,
      data: {
        startDate,
        endDate,
        type,
        totalTransactions: txns.length,
        inboundCount,
        outboundCount,
        inboundQuantity: inboundQty,
        outboundQuantity: outboundQty,
        transactions: txns,
        generatedAt: new Date().toISOString(),
      },
    };
  },

  /**
   * 生成库存周转报表
   * 周转率 = 期内出库数量 / 平均库存
   * 周转天数 = 周期天数 / 周转率
   */
  async generateTurnoverReport(args) {
    const { warehouse, periodDays = 30 } = args;

    // 模拟数据
    const records = [
      { sku: 'SKU-0001', warehouse: 'WH-MAIN', avgStock: 120, outboundQty: 240 },
      { sku: 'SKU-0002', warehouse: 'WH-MAIN', avgStock: 80, outboundQty: 60 },
      { sku: 'SKU-0003', warehouse: 'WH-WEST', avgStock: 200, outboundQty: 300 },
      { sku: 'SKU-0004', warehouse: 'WH-WEST', avgStock: 45, outboundQty: 10 },
    ];

    let rows = records.slice();
    if (warehouse) rows = rows.filter((r) => r.warehouse === warehouse);

    const result = rows.map((r) => {
      const turnoverRate = r.avgStock > 0 ? Number((r.outboundQty / r.avgStock).toFixed(2)) : 0;
      const turnoverDays = turnoverRate > 0 ? Math.round(periodDays / turnoverRate) : Infinity;
      return {
        sku: r.sku,
        warehouse: r.warehouse,
        avgStock: r.avgStock,
        outboundQty: r.outboundQty,
        turnoverRate,
        turnoverDays,
      };
    });

    return {
      success: true,
      data: {
        warehouse: warehouse || 'ALL',
        periodDays,
        items: result,
        generatedAt: new Date().toISOString(),
      },
    };
  },

  activate() {
    console.log('[wms-report-plugin] 插件已激活');
  },

  deactivate() {
    console.log('[wms-report-plugin] 插件已停用');
  },

  info() {
    return {
      name: 'WMS 报表生成',
      version: '1.0.0',
      description: '提供库存、出入库流水、库存周转等报表生成功能',
    };
  },
};

module.exports = plugin;
