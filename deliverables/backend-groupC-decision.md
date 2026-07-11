# 后端死代码 Group C 决策清单（需产品决策，非删除）

> 来源：knip v6 死代码扫描 + 179 文件 triage（见对话 triage 报告）。
> 原则：**全部保留，绝不删除**。本清单仅用于产品决策——哪些深子系统要正式启用。
> 状态：A 组（胶水，已接 context-engine 等）、B 组（cron/tool-plan/embeddings/plugin-sdk/reports/security-audit 等已加路由）已收口。以下 C 组共 **54 个文件（占 179 的 30%）**，属协议/传输/运行时层，盲目接线会分叉应用行为，需产品拍板。

---

## C1 · ACP 协议运行时（24 文件）— 最高成本/风险

**路径**：`server/engine/acp/*`（backgroundTask / client / commandLine / commands / config / doctorRegistry / doctorTypes / identityReconcile / permissionResolver / policyState / resumeState / runtimeApi / runtimeErrors / runtimeProxy / runtimeSessionMeta / secretFile / service / state / translatorPresentation / translatorReplay / translatorSessionList / turnResults / turnStream）

**现状**：活跃部分（`policy` / `sessionMapper` / `sessionManager` / `activeTurns`）已被 `toolExecutor` + `gateway/coreMethods` 引用且**未被 knip 标记死**。这 24 个是**扩展层**（runtime / translator / turnStream / doctor 等），构成一套完整的 Agent-Control-Protocol。

**决策点**：是否启用 ACP 引擎作为 agent 执行的标准协议层？
- 启用：需定义 ACP 与现有 `runChatSession` 执行管线的边界，避免双执行路径。
- 成本：高（涉及执行管线重构 + 前端 ACP 调试 UI）。
- 建议：产品路线图确定"A2A/agent 互操作"方向后再接；当前保留。

---

## C2 · 消息通道子系统（15 文件）

**路径**：`server/channels/access/*`（4：engine/gates/groups/index）+ `server/channels/adapters/*`（5：adapter-registry/channel-adapter/email-adapter/index/webhook-adapter）+ `server/channels/inbound/*`（5：handler/index/pipeline/queue/types）+ `server/channels/lookup.ts`（1）

**现状**：`/api/channels` 已挂载，但走的是 `channels/index.ts`（`registerBuiltinChannels`）另一条实现。这 15 个文件是**独立未接线的消息层**（访问控制 / 适配器 / 入站管线）。

**决策点**：统一到一套通道实现，还是保留并行？
- 若启用：以 `channels/access` 做权限网关、`channels/adapters` 做多通道（email/webhook）、`channels/inbound` 做入站管线，替换 `channels/index.ts` 的简化版。
- 成本：高（消息子系统是产品级功能，需前端通道管理 UI + 持久化）。
- 建议：作为"多通道消息"专项立项，不在本次零星接入。

---

## C3 · 网关传输层（8 文件）

**路径**：`server/gateway/*`：`call.ts` / `handshakeTimeout.ts` / `index.ts` / `mcpServer.ts` / `net.ts` / `probe.ts` / `webSocketHub.ts` / `wsReconnect.ts`

**现状**：活跃网关用 `gateway.ts` + `gatewayRoutes.ts` + `coreMethods.ts` + `chatMethods.ts`。这 8 个是**未接线的传输组件**（WebSocket Hub / MCP Server / 重连 / 探测）。

**决策点**：是否用 `webSocketHub` 替代/增强现有 SSE？是否启用 `mcpServer` 作为独立 MCP 暴露？
- 成本：中–高（传输层替换影响所有实时通信）。
- 建议：`webSocketHub` 可在"需要双向实时"时评估；`mcpServer` 若要做独立 MCP 网关可单独立项。当前保留。

---

## C4 · Agent 运行时内部件（5 文件）

**路径**：`server/engine/agentExecutionManager.ts` / `agentRuntime.ts` / `mcpManager.ts` / `subagentRegistry.ts` / `subagentRunner.ts`

**现状**：无引用方，是核心运行时内部件。

**决策点**：如何并入 agent 执行管线？
- 成本：中（需确定与 `runChatSession` / subagent 机制的接缝）。
- 建议：作为"subagent/多 agent 编排"能力立项时一并接入。

---

## C5 · CLI 工具入口（2 文件）

**路径**：`server/cli/index.ts` / `lazyRegister.ts`

**现状**：独立于 HTTP 路由图，经 `cli/program.ts` 潜在 bin 入口。

**决策点**：是否随桌面版发布 CLI？
- 成本：低–中（主要是打包/发布配置）。
- 建议：若产品需要"命令行运维"，可快速接入；否则保持库内可用。

---

## C6 · 孤立能力单例（约 30 文件）

**路径**（各自 `*.ts`）：
`engine/apiRegistry` / `authProfilePool` / `channel/delivery` + `channel/message-lifecycle` / `channelSessionManager` / `cliSystem` / `codeUnderstanding` / `configManager` / `contextCache` / `deviceAuth` / `embeddedRuntime` / `modelMetadata` / `nodeManager` / `oauthTypes` / `sessionFingerprint` / `sessionMapper` / `streamingHandler` / `thinkingMode` / `toolPolicy` / `toolSearch` / `web-content-extractors` / `workspaceManager` / `fastMode` / `fewShotTemplates` / `heartbeat` / `hooksManager`（+ `errors/failover` `errors/index` `infra/dedupe` `infra/file-lock` `infra/index` `infra/net` `infra/retry` `logging/diagnostic-health` `logging/redact` `message/envelope` 等归入各自簇）

**现状**：每个是孤立能力，需先确定接线点（多数并入 chat 执行器 / 引擎核心 / 全局中间件）后才激活。属"深度集成"而非"胶水"。

**决策点**：逐项评估接线点。
- 成本：逐个中–高。
- 建议：按"用户价值"排序（如 `thinkingMode` 思维模式、`toolSearch` 工具检索、`hooksManager` 钩子、`contextCache` 上下文缓存优先级高），纳入后续迭代，不在本次批量硬接。

---

## 汇总

| 组 | 文件数 | 状态 | 接入方式（2026-07-11 已执行） |
|----|-------|------|------|
| C1 acp | 24 | ✅ 已增量接入 | `POST /api/acp` + `/api/acp/health` + `/api/acp/doctor`（不替换 runChatSession；turns/run 未实现，优雅报错） |
| C2 channels | 15 | ✅ 已增量接入 | `server/routes/channelsCore.ts` → `/api/channels-core`（adapters/inbound/access/lookup，不动原 /api/channels） |
| C3 gateway | 8 | ✅ 已增量接入 | `server/routes/gatewayExt.ts` → `/api/gateway-ext`（诊断 + mcpServer 独立状态）；**WebSocket Hub 已真正挂载 httpServer**（`startGatewayWebSocket(server)`，路径 `/gateway/ws`，双向实时通道，不劫持 SSE） |
| C4 agent 运行时 | 5 | ✅ 已增量接入 | `server/routes/agentRuntime.ts` → `/api/agent-runtime`（subagent 编排桥接 + mcpManager 状态，不替换 runChatSession） |
| C5 cli | 2 | ✅ 已增量接入 | `bin/cdf-cli.mjs`（package.json bin）+ `POST /api/cli`（runCLI）；修复 program.ts 参数 bug |
| C6 单例 | ~30 | ✅ 已增量接入 | `server/routes/capabilities.ts` → `/api/capabilities`（17 个只读探测端点）+ `logging/redact` 接入全局错误中间件；**`codeUnderstanding` 已接 LIVE 工具解析链路**（注册内置工具 `code_understanding` + HTTP 面 `/api/code-understanding`）；其余逐文件 DOCUMENT 接线点 |
| **合计** | **~84** | **全部保留，零删除** | 增量激活，主执行链路行为不变 |

> 注：C6 与上表其他组有少量重叠（errors/infra/logging/message 部分文件已在 B 组或 live 路径评估）。实际独立 C 组文件数约 54（即 triage 报告中 C1–C5 的 54 个），其余已归入 A/B 或 live 路径处理。所有文件**未删除**，按"增量激活、不 fork 主执行链路"边界接入。
>
> **安全边界**：C1–C6 全部以"新增路由/端点 + 只读探测"方式接入，绝不替换 `runChatSession`/`streamExecutor`/`chatService` 等 live 路径。C4 的 `/subagents/run` 仅为休眠原型的增量编排桥接（返回 spawn 句柄，非真实执行）；C6 中 `toolSearch/hooksManager/contextCache/streamingHandler/toolPolicy/thinkingMode/fastMode/modelMetadata/fewShotTemplates` 等因会改变 LIVE 行为而仅以只读 HTTP 面暴露，未强接热路径。后端 `tsc -p server/tsconfig.json` 全量 **0 错误**。

---

## 执行续作（2026-07-11 下午）— 验证 + 真正挂载 + live 接线

用户确认"三个都做"后的收尾动作：

1. **新路由冒烟测试（已加）**
   - `e2e/api/groupC-smoke.test.ts`：ACP / channels-core / gateway-ext / agent-runtime / capabilities / cli 共 23 个用例（supertest + 动态 import 隔离，单簇失败不级联）。
   - `e2e/api/gateway-ws.test.ts`：真实创建 httpServer + 挂载 WS Hub + 客户端连 `/gateway/ws` 收到 `connected` 事件（端到端验证 WS 挂载）。
   - `e2e/api/code-understanding.test.ts`：HTTP 面 4 端点 + LIVE 工具 handler + `initDefaultTools` 注册断言，共 7 用例。
   - **结果：合并运行 31 用例全部通过。**
   - 修复：`/api/acp/doctor` 原会因 `getGlobalChannelRegistry` 未注入而抛 500，已让 `checkChannels` 防御性降级（未注入时返回 info 提示，行为不变）。

2. **C3 WebSocket Hub 真正挂载 httpServer**
   - `server/index.ts` 的 `server.listen` 回调内新增 `import('./gateway/webSocketHub.js').then(startGatewayWebSocket)`，非阻塞、失败仅 warn。
   - 挂载点：`/gateway/ws`，仅作双向实时通道，绝不劫持/替换 SSE 主链路。`ws` 包已安装。

3. **C6 codeUnderstanding 接 LIVE 工具解析链路**
   - 新增 `server/engine/codeUnderstandingTool.ts`（`handleCodeUnderstanding`，按 action 分发 analyzeFile/analyzeProject/explainSymbol/suggestImprovements，返回 JSON 字符串）。
   - `server/engine/toolRegistry.ts` 的 `initDefaultTools` 内动态注册内置工具 `code_understanding`（纯增量，不替换现有工具）。
   - 新增 `server/routes/codeUnderstanding.ts` → `/api/code-understanding`（只读分析面，与工具共用同一实现），并挂载于 `server/index.ts`。

**验证**：`npx tsc -p server/tsconfig.json` 全量 **0 错误**（含本轮新增/改动文件）；`npx vitest run` 相关用例 **31/31 通过**。
