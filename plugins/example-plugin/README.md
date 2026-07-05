# WMS 快速查询插件

一个简单的 Cross-WMS 示例插件，演示如何为 WMS 系统开发自定义工具插件。

## 功能

提供 `quick_stock_check` 工具，用于快速查询商品库存信息。

- 输入：商品 SKU
- 输出：库存数量、所在仓库、最后更新时间

## 安装

将该目录打包为 zip 后，通过插件管理接口安装：

```bash
# 打包
cd plugins/example-plugin
zip -r wms-quick-query.zip plugin.json index.js

# 安装
curl -X POST http://localhost:3000/api/plugins/install \
  -F "file=@wms-quick-query.zip"
```

## 使用

安装并启用后，AI 助手会自动获得 `plugin_wms-quick-query_quick_stock_check` 工具，可直接询问库存信息。

## 文件结构

```
example-plugin/
├── plugin.json   # 插件清单
├── index.js      # 入口文件（CommonJS）
└── README.md     # 说明文档
```

## 自定义

修改 `index.js` 中的 `execute` 函数，连接实际数据库即可替换模拟数据。
