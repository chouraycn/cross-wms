# P2-1 API 契约反向对齐 — 缺口分析与执行方案

> 关联：《2026-08-04 整合软件优化方向分析》P2 未执行项「API 契约倒挂」。
> 状态：缺口已量化、风险已复核、**执行方案已成形**。实际改动仍需等工作树干净（用户 commit 后进行中的 server/* 改动）。

## 1. 实测缺口（server/routes，共 143 文件）

| 分组 | 文件数 | 用 `{code:0,data,message}` envelope | 裸返回 |
|------|--------|--------------------------------------|--------|
| staff 路由 | 23 | **21** | 2 |
| 主程序路由 | 120 | **15** | **~105** |

- staff 侧 envelope 覆盖 21/23（一致）。
- 主程序侧仅 15/120 用 envelope，**约 105 个主程序路由返回裸 `{data:...}` 或裸对象**——这是「契约倒挂」的主体。

## 2. 风险复核（结果偏利好）

- 主程序前端 client `src/services/api.ts:63` 与 `:934` 均为：
  ```ts
  return (json.data ?? json) as T;
  ```
  **已同时兼容 envelope（`{code,data}`）与裸数据（无 data 字段直接透传）**。
- 已用 envelope 的 15 个主程序路由，正好是 WMS 系列（`inbound/outbound/inventory/transfer/wms-*` 等，`grep "res.json({ code"` 命中），其前端 handler（`api.ts:288-325`）已在做 `if (json.code !== 0) throw new Error(json.message)`。
- **结论**：把裸路由包成 `{code:0, data, message:''}` 对主 client 安全（自动 unwrap）；剩余风险仅在于：是否存在 handler 直接读 `json.xxx`（非 `data` 字段）却期望裸对象。

## 3. 执行方案（工作树干净后）

1. **新增共享响应 helper** `server/routes/_shared/respond.ts`：
   ```ts
   export function ok(res, data, message = '') {
     return res.json({ code: 0, data, message });
   }
   export function fail(res, code, message, httpStatus = 400) {
     return res.status(httpStatus).json({ code, data: null, message });
   }
   ```
2. **机械替换**主程序路由：
   - `res.json({ data: X })` / `res.json(X)` → `ok(res, X)`
   - `res.status(4xx).json({ message })` 类错误分支 → `fail(res, code, message)`
3. **全量回归**：前端 `tsc --noEmit` + 主程序各页面冒烟，确认无 handler 依赖裸字段。
4. **不动 staff 路由**（已对齐，避免回归）。

## 4. 执行前需拍板的两点

- **范围**：105 个裸路由全包，还是仅核心 CRUD？建议全包以彻底统一契约。
- **错误形态**：错误响应是否统一为 `{code, data:null, message}`（需同步前端错误提示从 `message` 取文案）。

## 5. 前置条件（硬）

`git status --porcelain` 必须为空。当前有 **26 处未提交**（用户 8+ 文件含 `server/engine/*`、`server/routes/agentChat.ts`、`server/staff/staffChatExecutor.ts` + 2 子模块 + 本会话文档），**与 P2-1 改动的 `server/routes` 直接重叠** → 必须先 commit，否则 merge conflict。

## 6. 配合项

与「git 瘦身」（同需干净树）一并执行顺序：
1. 用户 commit 26 处改动
2. 我跑 git 瘦身（filter-repo + gc + 强推）
3. 我执行 P2-1（105 路由包装 + 回归）
