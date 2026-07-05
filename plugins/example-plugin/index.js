// WMS 快速查询插件
// 这个插件提供一个简单的库存查询工具

const tool = {
  name: 'quick_stock_check',
  description: '快速查询商品库存',

  async execute(args) {
    const { sku } = args;
    if (!sku) {
      return { success: false, error: 'SKU 不能为空' };
    }

    // 这里可以连接实际数据库
    // 示例返回模拟数据
    return {
      success: true,
      data: {
        sku,
        name: `商品 ${sku}`,
        quantity: Math.floor(Math.random() * 1000),
        warehouse: '主仓库',
        lastUpdated: new Date().toISOString(),
      },
    };
  },

  // 插件激活时调用
  activate() {
    console.log('[wms-quick-query] 插件已激活');
  },

  // 插件停用时调用
  deactivate() {
    console.log('[wms-quick-query] 插件已停用');
  },

  // 插件信息
  info() {
    return {
      name: 'WMS 快速查询',
      version: '1.0.0',
      description: '提供 WMS 库存快速查询功能',
    };
  },
};

module.exports = tool;
