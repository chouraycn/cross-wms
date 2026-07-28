# 智能体生命周期管理 — 步骤详解

> 场景 ID: `agents-lifecycle`
> 主题: `agents/`
> 覆盖: 智能体创建 / 删除 / 启动 / 停止 / 列表
> 业务场景: WMS 仓库运营智能体的完整生命周期，绑定 `warehouseId` 后才能处理出入库消息

## 目标

验证 CrossWMS 智能体（agent）在 WMS 业务上下文中的完整生命周期，并保证：

- 智能体创建、列出、启动、停止、删除 API 行为一致；
- 智能体的运行状态在持久化层（`db-core` / `db-staff`）正确流转；
- 重名校验受 `warehouseId` 维度限制；
- 停止 / 删除后不能再产生新消息。

## 前置条件

| 条件 | 说明 |
| ---- | ---- |
| CrossWMS 后端 | `pnpm dev` 或 `pnpm server` 已启动 |
| 持久化 | 默认 localStorage 或 SQLite 已初始化 |
| 测试仓库 | 至少一个 warehouse 记录（脚本会通过 `db.seedWarehouse` 创建 `WH-SH-001`） |
| qa-channel | 启用，用于驱动 AI 助手回复 |
| Node | >= 22.19 |

## 详细步骤

### Step 1 — 重置持久化状态（`resets durable WMS state for the run`）

1. 调用 `reset`，清空上一次运行的智能体、消息、记忆。
2. 写入测试仓库 `WH-SH-001`（名称：上海前置仓 #1，容积 5000）。
3. 断言仓库存在，便于后续步骤引用。

**预期结果**

- `db.assertWarehouseExists` 通过。
- 持久化层中只有 1 个仓库 `WH-SH-001`。

### Step 2 — 创建智能体（`creates a new agent bound to the WMS warehouse`）

1. 调用 `POST /api/agents`：
   - `name`: `WH-OPS-AGENT-${uuid8}`
   - `warehouseId`: `WH-SH-001`
   - `role`: `warehouse-ops`
2. 断言返回 201 且 payload 包含 `id` / `warehouseId` / `state='stopped'`。
3. 调用 `GET /api/agents` 列表，确认新智能体在结果中。

**预期结果**

- 返回 `201 Created`。
- `state === 'stopped'`。
- 列表结果 `agents[].id` 包含新创建的 id。

### Step 3 — 重名校验（`rejects duplicate agent name in the same warehouse`）

1. 在 `WH-SH-001` 下再次用同名创建 → 期望 `409 Conflict`。
2. 在另一个仓库 `WH-BJ-001` 下用同名创建 → 期望 `201`。
3. 清理临时创建的 alternate agent（`WH-BJ-001`）。

**预期结果**

- 同一仓库内重名返回 `409`。
- 跨仓库同名允许 `201`。
- 清理后 `WH-BJ-001` 下智能体数量为 0。

### Step 4 — 启动智能体（`starts the agent and replies on the qa-channel with a marker`）

1. 调用 `POST /api/agents/:id/start`。
2. 断言 `state === 'running'`，且 `startedAt` 已写入。
3. 在 qa-channel 向智能体发送 marker prompt：`Agent start QA marker. Reply exactly: AGENT-START-OK`。
4. 等待智能体回复，断言文本包含 `AGENT-START-OK`。

**预期结果**

- `state` 流转到 `running`。
- 智能体在 qa-channel 上能基于绑定的 `warehouseId` 上下文进行回复。

### Step 5 — 停止智能体（`stops the agent and asserts WMS run-state`）

1. 调用 `POST /api/agents/:id/stop`。
2. 断言 `state === 'stopped'`，且 `stoppedAt` 已写入。
3. 重新 `GET /api/agents/:id` 验证持久化状态。
4. 在 qa-channel 发送 `AGENT-STOP-NOOP` prompt，期望智能体不再产生新回复；通过 `waitForCondition` 等待 `AGENT-STOP-OK` 哨兵 marker（来自 stop 路径的事件回执）。

**预期结果**

- 智能体在停止后不再产生新消息。
- 持久化层的 `state` 与 API 返回一致。

### Step 6 — 删除智能体（`deletes the agent and asserts it disappears from list and history`）

1. 调用 `DELETE /api/agents/:id`。
2. 断言 `deleted === true`。
3. 再次 `GET /api/agents` 列表，确认该智能体已不在结果中。
4. `GET /api/agents/:id` 期望 `404`。

**预期结果**

- 删除成功后列表、详情接口都不能再查到该智能体。
- 历史消息记录不再暴露（业务侧如需保留可走审计表，但 agent 自身已不可访问）。

## 预期产出（`expected_outcomes`）

- [x] Step 2 之后，新 agent 出现在列表中，`state='stopped'`。
- [x] Step 3 验证同仓库重名被拒、跨仓库同名允许。
- [x] Step 4 验证启动后 qa-channel 上能收到 `AGENT-START-OK`。
- [x] Step 5 验证停止后 `state='stopped'`，不再产生新消息。
- [x] Step 6 验证删除后列表与详情接口均 404。

## 失败模式与排查

| 症状 | 可能原因 | 排查 |
| ---- | -------- | ---- |
| 创建返回 500 | `db-core` 缺少 `agents` 表 | `pnpm db:migrate` 跑迁移 |
| 重名校验 200 | 唯一索引未覆盖 `(warehouse_id, name)` | 查看 `server/db-staff.ts` 索引声明 |
| 启动后无 marker 回复 | `qa-channel` driver 未注入 | 检查 `extensions/qa-channel` 是否启用 |
| 停止后仍能收到消息 | 后台轮询没停 | 检查 `server/engine/agents.ts` 的 `stop()` 路径是否触发 `unsubscribe` |
| 删除后列表仍有 | 软删除开关误开 | 确认 `agents.delete` 走 `hardDelete` 而非 `softDelete` |

## 相关文件

- `server/routes/agents.ts` — 路由层
- `server/engine/agents.ts` — 业务逻辑
- `server/db-core.ts` / `server/db-staff.ts` — 持久化
- `docs/agents/agent-lifecycle.md` — 业务设计文档
- `docs/wms/warehouse-scope.md` — 仓库维度隔离
