# WMS 报表生成插件

Cross-WMS 报表生成插件，为 AI 助手提供库存、出入库流水、库存周转等报表查询能力。

## 功能

提供以下三个工具：

| 工具名 | 说明 | 关键参数 |
|--------|------|----------|
| `generate_inventory_report` | 生成库存报表，按仓库/分类聚合数量与金额 | `warehouse`、`category`、`format` |
| `generate_transaction_report` | 生成出入库流水报表，支持时间段筛选 | `startDate`、`endDate`、`type` |
| `generate_turnover_report` | 生成库存周转报表，计算周转率与周转天数 | `warehouse`、`periodDays` |

### 库存报表

- `format=summary`（默认）：按「仓库 + 分类」聚合，返回分组汇总与合计。
- `format=detail`：返回每个 SKU 的明细（含数量、单价、金额）。

### 出入库流水报表

- `type` 可选：`inbound`、`outbound`、`all`（默认）。
- 日期格式为 `YYYY-MM-DD`，按日闭区间统计。

### 库存周转报表

- 周转率 = 期内出库数量 / 平均库存
- 周转天数 = 周期天数 / 周转率

## 安装

将该目录打包为 zip 后，通过插件管理接口安装：

```bash
cd plugins/wms-report-plugin
zip -r wms-report-plugin.zip plugin.json index.js

curl -X POST http://localhost:3000/api/plugins/install \
  -F "file=@wms-report-plugin.zip"
```

## 使用

安装并启用后，AI 助手会自动获得以下工具：

- `plugin_wms-report-plugin_generate_inventory_report`
- `plugin_wms-report-plugin_generate_transaction_report`
- `plugin_wms-report-plugin_generate_turnover_report`

可直接用自然语言询问，例如：
- “帮我生成主仓库的库存汇总报表”
- “统计最近 7 天的出库流水”
- “计算过去 30 天 WH-WEST 仓库的库存周转率”

## 文件结构

```
wms-report-plugin/
├── plugin.json   # 插件清单
├── index.js      # 入口文件（CommonJS）
└── README.md     # 说明文档
```

## 自定义

当前 `index.js` 中的数据为模拟数据。若要接入真实业务，替换以下方法中的数据来源即可：

- `generateInventoryReport` —— 替换为库存表查询
- `generateTransactionReport` —— 替换为出入库流水表查询
- `generateTurnoverReport` —— 替换为平均库存与出库聚合查询

## 风险等级

所有工具均为 `auto`（自动执行），不涉及写操作，无需审批。
