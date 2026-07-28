# 记忆存储 / 检索 / 删除 — 步骤详解

> 场景 ID: `memory-store-retrieve-delete`
> 主题: `memory/`
> 覆盖: 记忆存储 / 检索 / 删除 / 会话隔离
> 业务场景: WMS 业务事实（库存规则、库龄阈值、用户偏好）跨会话保留与隔离

## 目标

验证 CrossWMS 记忆引擎的完整链路：

1. 业务事实可被持久化，并立即可被 recall 命中；
2. 检索结果按相关度排序（top-k）；
3. 按 id 单条删除生效；
4. 按仓库 / scope 批量清理生效；
5. 跨仓库、跨会话严格隔离，不串数据。

## 前置条件

| 条件 | 说明 |
| ---- | ---- |
| CrossWMS 后端 | `pnpm dev` 或 `pnpm server` 已启动 |
| 持久化 | memory 表已初始化（`pnpm db:migrate`） |
| qa-channel | 启用，便于在 UI 内做交互探针 |
| Node | >= 22.19 |

## 详细步骤

### Step 1 — 重置记忆状态（`resets durable memory state`）

1. 调用 `memory.purge` 清空所有事实。
2. `memory.count` 断言总数 = 0。

**预期结果**

- 记忆库回到空状态，避免上一次运行残留干扰。

### Step 2 — 存储 WMS 业务事实（`stores the WMS business canary fact`）

1. 调用 `memory.store`：
   - `sessionKey`: `session-warehouse-ops-A`
   - `scope`: `warehouse`
   - `warehouseId`: `WH-SH-001`
   - `fact`: `SKU-COFFEE-001 在 WH-SH-001 的安全库存是 20 件`
   - `tags`: `["wms", "inventory", "canary"]`
2. 断言返回 `id` / `warehouseId`。

**预期结果**

- 返回的 `id` 在后续 step 引用。
- 持久化层已落盘该条事实。

### Step 3 — 立即检索（`recalls the canary fact immediately after store`）

1. 调用 `memory.recall`：
   - `sessionKey`: `session-warehouse-ops-A`
   - `scope`: `warehouse`
   - `warehouseId`: `WH-SH-001`
   - `query`: `WH-SH-001 仓库的咖啡 SKU 安全库存`
   - `topK`: 3
2. 断言第一条结果的 `fact` 包含 `SKU-COFFEE-001`。

**预期结果**

- 检索 top-1 即命中 canary。
- 验证 recall 在 store 后立即可用（短期记忆一致）。

### Step 4 — 跨仓库隔离（`stores a secondary fact in another warehouse and validates recall isolation`）

1. 在 `WH-BJ-001` / `session-warehouse-ops-B` 下存储：`SKU-TEA-007 在 WH-BJ-001 的库龄预警是 30 天`。
2. 在 `WH-SH-001` / session A 下用 query `WH-SH-001 的咖啡 SKU` 检索：
   - 断言所有结果的 `warehouseId` 要么等于 `WH-SH-001`，要么 `scope='global'`。
3. 在 `WH-BJ-001` / session B 下用 query `WH-BJ-001 库龄预警 SKU` 检索：
   - 断言结果包含 `SKU-TEA-007`。

**预期结果**

- 跨仓库不会串数据。
- 同一仓库内 recall 仍然能命中对应事实。

### Step 5 — 会话隔离（`validates session isolation for the same warehouse`）

1. 在 `WH-SH-001` / `scope='session'` 下用 session B 检索。
2. 断言所有 `scope='session'` 的结果都属于 session B。

**预期结果**

- session 级别记忆不会跨会话泄露。
- `scope='global'` / `scope='warehouse'` 的事实可以跨会话可见。

### Step 6 — 单条删除（`deletes the canary and confirms recall no longer returns it`）

1. 调用 `memory.delete({ id: canaryId })`。
2. 断言 `deleted === true`。
3. 重新 recall 同样的 query，断言结果中不再包含 `canaryId`。

**预期结果**

- 删除后单条事实不可被召回。
- 索引、向量存储同步更新（无僵尸记录）。

### Step 7 — 批量删除（`bulk deletes by warehouse scope`）

1. 调用 `memory.bulkDelete({ where: { warehouseId: 'WH-BJ-001', scope: 'warehouse' } })`。
2. 重新 recall `WH-BJ-001` 的库龄相关 fact，断言结果为空。
3. 断言 `bulkResult.deletedCount >= 1`。

**预期结果**

- 批量删除返回的 `deletedCount` 与实际一致。
- 再次 recall 没有任何来自 `WH-BJ-001` 的事实。

## 预期产出（`expected_outcomes`）

- [x] Step 2/3 验证 store → recall 立即可用。
- [x] Step 4 验证跨仓库严格隔离。
- [x] Step 5 验证 session 级别记忆隔离。
- [x] Step 6 验证单条删除生效。
- [x] Step 7 验证批量按 warehouse 清理生效。

## 失败模式与排查

| 症状 | 可能原因 | 排查 |
| ---- | -------- | ---- |
| 立即 recall 命中为空 | 索引未刷新 | 检查 `memoryEngine.ts` 中 store 后的索引提交 |
| 跨仓库出现串数据 | 过滤条件漏掉 `warehouseId` | 在 recall SQL / DSL 中确认带 `warehouseId` |
| 删除后仍能 recall | 软删除开关误开 | 确认 `memory.delete` 走 `hardDelete` |
| bulkDelete `deletedCount=0` | where 条件不匹配 | 检查 `server/memoryEngine.ts` 的 query builder |
| session 隔离失败 | `scope` 字段未参与过滤 | 验证 `recall` 的 query 中包含 `scope` 字段 |

## 相关文件

- `server/memoryEngine.ts` — 记忆引擎核心
- `server/routes/memory.ts` — 路由层
- `server/db-core.ts` — 持久化
- `docs/memory/memory-engine.md` / `docs/memory/recall.md` / `docs/wms/warehouse-scope.md`
