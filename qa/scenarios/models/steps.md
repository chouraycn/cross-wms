# 模型切换 / Failover / 能力检测 — 步骤详解

> 场景 ID: `models-switch-failover-capabilities`
> 主题: `models/`
> 覆盖: 模型切换 / Failover / 能力检测
> 业务场景: WMS AI 助手的多模型协作、模型健康降级、能力矩阵灰度

## 目标

验证 CrossWMS 模型管理的三条关键路径：

1. **模型切换** — 同一会话内切换到备用模型，工具调用与上下文保持；
2. **Failover** — 主模型被标记为不可用时，下一次请求自动降级到备用模型；
3. **能力检测** — 模型注册时按能力标签（`tool` / `vision` / `long-context`）做能力矩阵校验。

## 前置条件

| 条件 | 说明 |
| ---- | ---- |
| CrossWMS 后端 | `pnpm dev` 或 `pnpm server` 已启动 |
| 模型注册 | `gpt-4o` / `claude-3-5-sonnet` / `gpt-4o-mini` 均已注册 |
| qa-channel | 启用，便于在 UI 内做交互探针 |
| Node | >= 22.19 |

## 详细步骤

### Step 1 — 准备 WMS 业务上下文（`seeds the WMS plan context and verifies the primary model`）

1. 调用 `reset` 重置会话。
2. 调用 `models.list` 验证主模型 `openai/gpt-4o` 已注册。
3. 在 qa-channel 发送首轮 prompt，要求模型总结 WMS 业务上下文（Q3 中秋备货方案）。
4. 记录 `models.usage` 中主模型的初始用量。

**预期结果**

- 主模型在 `models.list` 中可见。
- 首轮回答中包含业务上下文关键词（"Q3 中秋备货"）。

### Step 2 — 模型切换 + 工具连续性（`switches to the secondary model and preserves tool continuity`）

1. 切换 provider/model 到 `anthropic/claude-3-5-sonnet`。
2. 发送 prompt：`Tool continuity check: use the read tool to reread the current WMS plan, then in one short sentence mention the model handoff and the Q3 plan.`
3. 等待回复，断言：
   - 文本包含 `Tool continuity check`；
   - 文本包含 `Q3 中秋备货`（说明上下文保留）。
4. 在 mock 模式下额外断言：
   - `plannedToolName === 'read'`（说明工具仍被调用，未回退纯文本）；
   - `model === 'anthropic/claude-3-5-sonnet'`（说明确实切到了备选模型）。

**预期结果**

- 模型切换后上下文不丢失，工具调用仍生效。
- mock 模式下能精确定位到切换后的请求并校验参数。

### Step 3 — Failover 演练（`marks primary model unavailable and triggers failover`）

1. 调用 `models.markUnhealthy({ id: 'openai/gpt-4o', reason: 'qa-forced-failover' })`。
2. 断言 `healthy === false`。
3. 调用 `models.failover({ from, to: 'openai/gpt-4o-mini', reason: 'primary-unhealthy' })`。
4. 断言 `activatedModel === 'openai/gpt-4o-mini'`。
5. 在 qa-channel 发送 `Failover QA marker. Reply exactly: FAILOVER-OK`。
6. 等待回复，断言文本包含 `FAILOVER-OK`。
7. 在 mock 模式下额外断言实际请求的 `model === 'openai/gpt-4o-mini'`，说明降级真正生效。

**预期结果**

- 主模型被标记不可用后，下次请求自动走 failover 模型。
- 调用方对失败无感（reply 仍然正常）。

### Step 4 — 能力矩阵校验（`validates model capability matrix`）

1. 调用 `models.capabilities` 拉取所有模型的能力标签。
2. 对每个模型：
   - 断言 `capabilities` 是数组；
   - 断言 `tool` / `long-context` 在每个模型的能力列表中（`capabilitiesExpectedAll`）；
   - 对 `visionRequired` 集合中的模型（`gpt-4o` / `claude-3-5-sonnet`），断言 `vision` 在能力中；
   - 对 `visionNotRequired` 集合中的模型（`gpt-4o-mini`），断言 `vision` 不在能力中。
3. 调用 `models.restore({ id: 'openai/gpt-4o' })` 恢复主模型健康状态。

**预期结果**

- 能力矩阵与模型注册表一致。
- 灰度策略能基于能力标签正确路由（如带图片的请求不发到 `gpt-4o-mini`）。

## 预期产出（`expected_outcomes`）

- [x] Step 2 验证切换模型后工具调用与上下文连续。
- [x] Step 3 验证 failover 自动降级到 `gpt-4o-mini`。
- [x] Step 4 验证能力矩阵正确反映 `tool` / `vision` / `long-context` 能力。
- [x] 收尾恢复主模型健康状态，避免污染后续场景。

## 失败模式与排查

| 症状 | 可能原因 | 排查 |
| ---- | -------- | ---- |
| 切换后无 read 工具调用 | 模型 schema 未声明 tools | 检查 `server/engine/models.ts` 的 `registerTools` |
| failover 后请求仍打到主模型 | `markUnhealthy` 缓存未失效 | 确认 `keyRotator.ts` 与 `modelsStore.ts` 状态同步 |
| 能力矩阵缺 `vision` | 注册时未带 capability tag | 跑 `pnpm models:resync` 重新同步能力标签 |
| 切换后上下文丢失 | session-key 重新生成 | 确认 `runAgentPrompt` 使用同一 `sessionKey` |
| `models.restore` 不生效 | unhealthy 状态被持久化 | 确认 `modelsStore.ts` 的 `restore` 走 `health=true` 路径 |

## 相关文件

- `server/routes/models.ts` — 路由层
- `server/engine/models.ts` — 模型调用
- `server/modelsStore.ts` — 模型注册表
- `server/keyRotator.ts` — Key 轮换 & 健康检查
- `docs/models/model-switch.md` / `docs/models/failover.md` / `docs/models/capability-detection.md`
