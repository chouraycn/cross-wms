# OpenClaw ↔ cdf-know-clow（CrossWMS）完整度与下一步方向

> 分析日期：2026-07-11（本次"死代码全做"整合收尾后）
> 范围：对比 vendored `openclaw/`（OpenClaw v2026.6.9）与产品 `cross-wms`（cdf-know-clow v1.7.81）
> 依据：`FORK_BOUNDARY.md`、`ReAct_v6.0_完成度与分叉报告.md`、双端代码探索盘点、目录/脚本实测

---

## 1. 一句话结论

**cdf-know-clow 是 OpenClaw 的"硬 fork + 行业化重写"**：它把 OpenClaw 的 agent 引擎核心深度接管并自研增强（ReAct 优化、WMS 业务域、Auto 模型路由、向量记忆），但**刻意没有跟随 OpenClaw 的广度**——25 个消息通道、52 个 LLM Provider 扩展、40+ 工具、原生移动端、Canvas/A2UI、语音、媒体生成。本次死代码整合把一批"休眠/只读"的 agent 管理与网关扩展面真正接活，但 ACP 执行、通道入站、多智能体仍是只读或休眠。

**整体 fork 完整度 ≈ 35–40%**（OpenClaw 全表面计），但分布极不均衡：
- **引擎核心层完整度 ≈ 60%**（且多处超规格自研）
- **生态广度层完整度 ≈ 15%**（通道/Provider/工具/原生端几乎未 fork）
- **独有资产 100%**：WMS 业务域、Electron/PyWebView 桌面壳、ReAct v6 优化、Auto 模型路由

---

## 2. 关系定位（来自 FORK_BOUNDARY.md）

| 层 | 路径 | Git 跟踪 | 运行时是否读取 |
|----|------|---------|---------------|
| 上游参考副本 | `openclaw/`（OpenClaw 2026.6.9 完整副本） | **否**（`.gitignore` 忽略） | **否** — 仅 vendored 参考 |
| 产品硬 fork | `packages/`（`@cdf-know/*`，5 个包 v1.0.0） | 是 | **是** — 真正运行的 agent 框架 |
| 产品应用 | `server/` + `src/` + `cli/` + `extensions/` | 是 | 是 |

`@cdf-know/*` 与 OpenClaw 的派生关系：

| 产品包 | 模块数 | 上游对应面 | 派生方式 |
|--------|-------|-----------|---------|
| `@cdf-know/plugin-sdk` | 21 | OpenClaw `plugin-sdk`（83） | 部分 fork（21/83，0 个同名文件） |
| `@cdf-know/agent-core` | 20 | `agent-core`/`src/agents` | 部分 fork + 自研 `embedded/`/`harness/` |
| `@cdf-know/llm-core` | 8 | `llm-runtime`/`model-router` | 部分 fork + 自有 `provider.ts` |
| `@cdf-know/memory-host-sdk` | 12 | memory 子系统 | **完全重实现**（结构非 1:1） |
| `@cdf-know/skill-core` | 13 | `skills` | 部分 fork |

⚠️ **Drift 风险（FORK_BOUNDARY §4）**：曾经同步的 4 个上游修复全部落进被忽略的 `openclaw/` 副本，**未触达运行时**；其中 3 个 memory 修复因 `@cdf-know/memory-host-sdk` 结构不同而无法 1:1 port。说明当前的"同步"机制对产品实际行为可能无效。

---

## 3. 完整度对比矩阵

| 维度 | OpenClaw（上游） | cdf-know-clow（fork 后） | 完整度 | 说明 |
|------|----------------|------------------------|-------|------|
| **Agent 运行时** | `agent-core` 49 模块 | `@cdf-know/agent-core` 20 模块 + 自研 harness | ~40% | 深度接管且超规格自研 |
| **执行策略** | 自有 agent loop | Legacy/ReAct/Agent + AUTO 工厂 + 降级 | **超规格** | ReAct v6 优化 P0-2/3/4/5、P1-2/3 已落地 |
| **LLM 抽象** | `llm-core`7 + `llm-runtime`6 | `@cdf-know/llm-core`8 + `model-catalog` + 20+ provider | ~60% | 额外有 Auto 模型智能路由+故障转移 |
| **插件 SDK** | `plugin-sdk` 83 | `@cdf-know/plugin-sdk` 21 | ~25% | 抽样 0 同名，已定制 |
| **记忆系统** | memory-runtime/state/lancedb + 多 memory ext | `@cdf-know/memory-host-sdk` 12（重实现）+ sqlite-vec/ONNX 向量记忆 | **重实现** | 非 fork，自有向量记忆已活接 |
| **技能** | `skills` 系统 + ClawHub | `@cdf-know/skill-core`13 + 前端 SkillWorkshop | ~50% | 前端技能工坊已接 |
| **消息通道** | 25 通道（WhatsApp/Telegram/Slack/Discord/Feishu/WeChat/QQ…） | 仅 `channels-core` 只读路由 + `ChannelsPage` 壳 | **~5%** | 几乎未 fork，桌面 App 路线不需要网关通道 |
| **MCP** | acpx MCP bridge | `routes/mcp.ts` + `mcpManager` + 自研 MCP 客户端 | 自有实现 | 已活接 |
| **ACP** | 一等公民（`acp-core` + `acpx`） | `routes/acp` 只读诊断，`turns/run` 未实现（优雅报错） | **~10%** | 仅诊断/会话记账 |
| **工具/集成** | ~40（browser/搜索/STT/TTS/媒体/编码代理） | 17 builtin + plugin + MCP | ~15% | 自有子集，缺 browser/搜索/媒体/语音 |
| **多智能体** | `acp-core` session-lineage + subagents + codex/opencode 路由 | `agent-runtime` 路由（只读），`/subagents/run` 休眠 | **~10%** | 休眠原型 |
| **前端控制面** | `ui/` Vite 控制面 | React + MUI **70+ 页面** 全功能桌面 | **超规格** | 方向不同，更重 |
| **桌面原生端** | android/ios/macos/windows（Swift/Java） | Electron 壳 + PyWebView（桌面） | **替代方案** | 走桌面路线，放弃移动端 |
| **Canvas / A2UI** | Live Canvas（agent 驱动可视工作区） | 无 | **0%** | 未跟随 |
| **语音 Wake/Talk** | `speech-core` + 多 STT/TTS 扩展 | 无（仅 `talk/` 服务壳） | **0%** | 未跟随 |
| **媒体生成** | comfy/fal/runway/image/video 生成 | 无 | **0%** | 未跟随 |
| **测试体系** | 383 单测 + docker e2e + maturity-scores | vitest + playwright 单元/e2e 部分 | ~30% | 本次新增 31 冒烟测试 |
| **打包/CI** | Docker/fly/render + 大量 CI | DMG + Docker + CI | ~50% | 桌面 DMG 为主 |
| **WMS 业务域** | 无（通用助手） | 完整 WMS（库存/出库/质检/补货/中转/调拨/伙伴/仓） | **独有 100%** | fork 后新增大头 |

---

## 4. 本次"死代码全做"整合带来的完整度增量

| 类别 | 整合前 | 整合后（已活接） |
|------|-------|----------------|
| **前端功能簇** | Workflow/Goals/Automation/Matching/Wiki/Memory/Git 多为死组件 | 全部调用真实 `/api/*` 端点，非死码 |
| **ACP 面** | `routes/acp` 存在但能力未暴露 | `/api/acp` + `/health` + `/doctor`（只读 JSON-RPC 透传） |
| **网关扩展** | `gateway-ext` 休眠 | `/api/gateway-ext`{health,mcp/start,mcp/status} 已挂 |
| **Agent 运行时可见性** | 不可见 | `/api/agent-runtime`{subagents,mcp,health}、Capabilities 17 只读探测端点 |
| **代码理解** | `codeUnderstanding` 低确定性单例 | `code_understanding` 注册进 `initDefaultTools`，`/api/code-understanding` 活接 |
| **CLI** | `bin/cdf-cli.mjs` 薄 | `routes/cli` + `POST /api/cli` 活接 |
| **WebSocket** | `webSocketHub` 休眠 | 挂 `httpServer`（`/gateway/ws`）真正运行 |
| **新业务路由** | cron/tool-plan/embeddings/plugin-sdk/reports/security-audit 死码 | 全部挂载 + 31 冒烟测试守护 |

**增量小结**：agent 管理与网关扩展面的"可读/可探"完整度从 ~5% 提升到 ~25%；但**"可执行"深度（ACP turns/run、通道入站、subagents 真实 spawn）仍是 0**，属安全边界（增量激活不 fork 主链路）的必然结果。

---

## 5. 关键缺口（按优先级）

### 缺口 1 — ReAct v6.0 三大缺口（来自 `ReAct_v6.0_完成度与分叉报告.md`）
- **A. 反思阶段被有意关闭**：`reactExecutor.ts:12` 移除 `reflectionPhase`/`llmReflect` → P0-1 置信度早停、P1-5 自评分失效。需先确认是否为有意决策（省 token），再决定是否重启用。
- **B. Planner 动态重规划未实现**：`planner.ts` 无 `detectDrift`/`replan`/`topologicalSort`，P0-6 未落地。
- **C. 前端 T04 完全缺失**：`ReactPhaseIndicator`/`ExecutionPlanPanel` 不存在，`ChatContext.tsx` 未消费 `reflection_confidence`/`budget_exceeded`/`complexity_assessment`/`replan_triggered`/`context_compressed` 5 事件 → 用户看不到 ReAct 过程。

### 缺口 2 — ACP 仅只读
`routes/acp` 只做诊断/会话记账，`turns/run` 未实现。OpenClaw 中 ACP 是一等公民（acp-core + acpx 运行时后端），此处是"探路"状态。若要承接上游 ACP 生态，需补 `turns/run` 真实执行（但会分叉主 chat 链路，需谨慎）。

### 缺口 3 — 通道/多智能体休眠
`channels-core` 只读、`/subagents/run` 返回 spawn 句柄/优雅报错。这是桌面 App 路线与 OpenClaw 网关路线的根本分歧——产品不需要 25 个消息通道入站，但**多智能体编排**对复杂 WMS 任务有价值，值得激活。

### 缺口 4 — 工程成熟度差距
OpenClaw 有 383 单测 + docker e2e + `qa/maturity-scores.yaml`（4362 行量化成熟度）+ 大量 boundary/architecture-smell 守卫。产品仅有 vitest+playwright 部分覆盖 + 本次 31 冒烟测试，缺**量化成熟度基线**与 **knip 死代码 CI 闸门**（上游 `deadcode:knip` 已成熟）。

### 缺口 5 — Fork Drift 风险
`openclaw/` 被 git 忽略、无 commit pin、同步脚本对运行时无效（FORK_BOUNDARY §4）。长期会劣化"参考副本"价值，且 4 个上游修复未达运行时。

---

## 6. 下一步方向（建议优先级）

### P0 — 收口 ReAct v6 三大缺口（对齐既有报告）
- **选项 1（重路线）**：重建 T04 前端两组件 + 接入 `ChatContext` 消费 5 事件；`planner.ts` 补 `detectDrift/replan/topologicalSort`；重启用 reflection 早停/自评分（需评估 token 成本）。
- **选项 2（对齐文档）**：若 reflection 关闭是有意决策，更新 PRD/ARCH 使其与真实架构一致，标记 v6.0 核心完成；仅补缺口 C 最小前端可见性。
- **选项 3（最小可见性）**：只做缺口 C（前端消费现有事件 + 轻量进度条），A/B 留 v6.1。风险最低、收益直接。**建议先确认缺口 A 的 reflection 关闭是否 intentional（git blame / 设计评审），再定选项。**

### P1 — 建立 Fork 同步纪律（解 Drift 风险）
1. 把 `openclaw/` 改为 **pinned submodule 或带 SHA 的 vendored + drift CI**（`sync-openclaw.sh --fail-on-drift` 接入 CI）。
2. 修正"同步未达运行时"问题：memory 3 修复需语义比对后重做进 `@cdf-know/memory-host-sdk`（非拷贝）；DMG 背景图修复应 port 进 `scripts/create-dmg.sh`（FORK_BOUNDARY §6 已给 diff）。
3. ReAct v6 稳定前**不切换地基**（维持硬 fork）。

### P2 — 选择性吸收 OpenClaw 广度（按 WMS 桌面场景筛选）
| 候选能力 | 价值 | 优先级 |
|---------|------|-------|
| 更多 LLM Provider（OpenAI/Anthropic/Google/DeepSeek/Ollama 已有，可补 Bedrock/Vertex/国产云） | 高（多厂商路由） | 高 |
| MCP 工具市场（browser/搜索/文件系统） | 高（agent 能力） | 高 |
| 多智能体编排（subagents 真实 spawn） | 中高（复杂 WMS 任务） | 中 |
| 消息通道（25 个） | 低（桌面 App 不需要网关入站） | 低/跳过 |
| Canvas/A2UI、语音、媒体生成 | 低（与 WMS 桌面无关） | 跳过 |

### P3 — 工程成熟度对齐
- 引入 **knip 死代码 CI 闸门**（对标上游 `deadcode:knip`），防止本次"死代码全做"成果回潮。
- 建立 **maturity-scores 量化基线**（对标 `qa/maturity-scores.yaml`），定期跑出完整度百分比。
- 把本次 31 冒烟测试扩展为端到端回归（对标上游 docker e2e）。

---

## 7. 总体判断

cdf-know-clow 不是"OpenClaw 的精简版"，而是一次**有方向的硬 fork**：**砍掉网关/通道/移动端/媒体广度，重投 agent 引擎深度 + WMS 行业域 + 桌面壳**。这条路线对"桌面端 WMS 智能助手"定位是合理的。本次整合把 agent 管理与网关扩展面的"可读/可探"层补齐，下一步的真正价值在 **P0（ReAct 收口）** 与 **P1（fork 同步纪律）**——前者决定产品 AI 能力是否"看得见、调得动"，后者决定这份 fork 能否长期不劣化。

生态广度（通道/Provider/工具）应按 WMS 桌面场景**选择性吸收**，而非全量跟随，避免无谓的维护负担。
