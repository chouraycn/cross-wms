# 自然语言库存查询 v1.7.0 — 代码实现完成

**日期**: 2026-06-09 | **状态**: ✅ 全部完成 | **tsc 错误**: 0 新增

---

## TL;DR

完成了自然语言库存查询 v1.7.0 全部 5 个代码实现任务（T01-T05），覆盖 Prompt 模板扩展、useChat 数据流增强、QueryResultRenderer 操作增强、后端 API 增强、意图分类 UI 与快捷示例。共修改/新建约 20 个文件，tsc 零新增错误。

---

## 交付概览

| 指标 | 数值 |
|------|------|
| 总任务 | 5 |
| 完成 | 5 ✅ |
| tsc 新增错误 | 0 |
| 修改文件 | ~12 |
| 新建文件 | ~8 |

---

## 各任务完成情况

### T01: Prompt 模板全量扩展 + 类型基础设施 ✅
- `server/prompts/inventory-query-prompt.ts` (427行) — 9 张表 Schema + 意图分类 + few-shot 样例
- `src/types/inventory-query.ts` — DataSourceType、QueryIntentType 联合类型
- `src/types/skill.tsx` — IntentCategory、INTENT_CATEGORY_LABELS、INTENT_QUICK_EXAMPLES

### T02: useChat 数据流增强 + MarkdownRenderer ✅
- `src/hooks/useChat.ts` — dataSource 解析 + autoRetryOnError 自动纠错重试
- `src/components/CrossWmsChat/MarkdownRenderer.tsx` — 跳过 inventory_query 代码块渲染

### T03: QueryResultRenderer 操作增强 ✅
- `QueryResultRenderer.tsx` — COLUMN_LABEL_MAP (60+ snake_case→中文)、行点击路由、补货确认操作列、CSV 元数据导出
- `ConfirmReplenishmentButton.tsx` (新建) — 补货确认按钮，状态机 idle→loading→success/error
- `exportCsv.ts` — exportCsvWithMetadata() 函数

### T04: 后端 API 增强 ✅
- `server/routes/wms-replenishment.ts` — 新增 POST /:id/confirm 端点
- `server/routes/inventory-nl-query.ts` — LRU 缓存
- `server/index.ts` — SSE done 事件附加 errorCode/errorMessage

### T05: 意图分类 UI + 快捷示例 ✅
- `TopBarChatInput.tsx` — 意图分类 Chips 行 + 快捷示例 Popover + handleSend overrideText
- 5 个意图分类：库存明细 / 出入库趋势 / 补货分析 / 预警摘要 / 预测分析
- 每分类 3 个快捷示例，点击自动填入并发送

---

## 关键文件清单

```
src/components/CrossWmsChat/
  TopBarChatInput.tsx          (修改) — 意图分类 UI
  QueryResultRenderer.tsx      (修改) — 操作增强
  MarkdownRenderer.tsx         (修改) — 跳过代码块
  ConfirmReplenishmentButton.tsx (新建) — 补货确认
  index.tsx                    (修改) — API 集成
src/hooks/
  useChat.ts                   (修改) — dataSource 解析
src/types/
  skill.tsx                    (修改) — 意图分类类型
  inventory-query.ts           (新建) — 查询类型
src/utils/
  exportCsv.ts                 (修改) — 元数据导出
server/
  prompts/inventory-query-prompt.ts (修改) — Prompt 模板
  routes/inventory-nl-query.ts (修改) — LRU 缓存
  routes/wms-replenishment.ts  (修改) — 确认端点
  index.ts                     (修改) — SSE 增强
```

---

## 下一步建议

1. **启动开发服务器验证 UI**: `cd cross-wms && npm run dev`
2. **选择 `builtin-inventory-query` 技能** → 验证意图分类 Chips 行是否正常展示
3. **点击意图分类 Chip** → 验证快捷示例 Popover 是否正确弹出
4. **点击快捷示例** → 验证是否自动填入输入框并发送
5. **运行全量测试回归**: `npm test`
