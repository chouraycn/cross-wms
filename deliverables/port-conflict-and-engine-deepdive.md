# 下钻报告：端口冲突根治 + 执行引擎策略数据流

> 日期：2026-07-29　|　分析对象：`cdf-know-clow@1.7.169`
> 下钻来源：整体架构分析（§7 风险点 ③端口漂移、§4 执行引擎）

---

# Part 1 — 端口冲突根因根治（含一个意外重大发现）

## 1.1 表面现象 vs 真实根因

**表面现象**（架构报告 §7 标记的中风险）：
- `.env.example` 写 `CROSS_WMS_APP_PORT=3000`，后端实际默认 `3001` —— 文档端口漂移。
- 本机/CI 跑 `smoke` 偶发失败（`fetch failed` / 超时），疑似陈旧进程占端口。

**真实根因（远更严重）**：
> **server 进程启动即崩溃，根本没监听任何端口。**

崩溃栈：
```
server/services/skillMdParser.ts:8
import yaml from 'js-yaml';
       ^
SyntaxError: The requested module 'js-yaml' does not provide an export named 'default'
```

- 依赖解析把 `js-yaml` 解析成了 **5.2.2（ESM-only，无 default 导出）**，而代码用 `import yaml from 'js-yaml'`（default 导入）。
- 该错误发生在**模块加载阶段**，导致 `server/index.ts` 整个进程在 `listen()` 之前就 `SyntaxError` 退出。
- 结果：所有 API 不可达（数字员工全 502、smoke 永远 `fetch failed`）。**之前所有"端口冲突/冷启动慢"的判断都是表象，真凶是启动崩溃。**

## 1.2 受影响文件（8 处 default 导入，全在 server/scripts）

| 文件 | 行 |
|------|----|
| `server/services/skillMdParser.ts` | 8 |
| `server/services/docQualityChecker.ts` | 12 |
| `server/services/openclaw/skillMetadata.ts` | 1 |
| `server/routes/skills.ts` | 42 |
| `server/cli/commands/skills.ts` | 22 |
| `server/engine/cli/skills-cli.scanner.ts` | 7 |
| `scripts/test-skill-parser.mjs` | 1 |
| `docs/FIX_REPORT.md`（文档，未改） | 58 |

## 1.3 修复清单（均已落地）

1. **启动崩溃修复（关键）**：上述 7 个代码文件的 `import yaml from 'js-yaml'` → `import * as yaml from 'js-yaml'`。
   - 验证：`import * as yaml` 运行时 `yaml.load` 正常，`DEFAULT_SCHEMA` 虽为 `undefined` 但代码未使用（仅 `yaml.load`），tsc 类型错误随之消失。
2. **端口变量统一（`server/index.ts:705`）**：新增 `resolveServerPort()`，优先级 `process.env.PORT` > `process.env.CROSS_WMS_APP_PORT` > `--port=` argv > `3001`。消除"改端口无效"的配置漂移（Swift 壳 `AppConfig.swift:47` 也读 `PORT` 默认 3001，事实标准统一）。
3. **文档同步（`.env.example:12`）**：`CROSS_WMS_APP_PORT=3000` → `=3001`，注释改 `(default: 3001)` 并注明 server 实际读 `PORT`。
4. **CI 假红根治（`e2e/api/smoke.e2e.test.ts`）**：固定端口 `13099` → **探测随机空闲端口**（`net.createServer` 监听 0 后取端口），彻底消除与并行/陈旧进程在固定端口冲突。

## 1.4 验证结果

| 项 | 结果 |
|----|------|
| `tsc --noEmit`（根，8G 堆） | **0 错误**（js-yaml 类型报错消失） |
| server 启动 | `HEALTH 200` 约 4s（之前崩溃） |
| `smoke` 隔离 | **2/2**（2.5s，远快于 60s 阈值） |
| `test:e2e:api` 整跑 | **360 passed / 40 files 全绿**（之前整跑 smoke+groupC 红，真因即启动崩溃+固定端口） |

> 结论：端口问题是表象，**js-yaml 启动崩溃才是"数字员工全 502 / smoke 假红"的共同真凶**。两处一并根治后，整跑 e2e 首次全绿。

---

# Part 2 — 执行引擎策略数据流（深度下钻）

## 2.1 架构澄清（最重要）

预设的"四种策略 Legacy/Observer/Planner/ReAct"**不在同一层级**：

- **顶层策略**由 `ExecutionMode` 枚举驱动，只有 4 个值：`LEGACY` / `REACT` / `AGENT` / `AUTO`（`AUTO` 是运行时自动选型的占位符，非真正执行策略）。
- **`Observer` 与 `Planner` 不是顶层策略**，而是 `REACT` 策略内部的**两个子引擎**（反思 / 规划）。
- 三个同名干扰文件需排除：`engine/auto-reply/`（IM 渠道被动回复，非 ReAct Observer）、`engine/tools/planner.ts`（工具级规划，非主 Planner）、`engine/credentialPlanner.ts`（网关凭证规划）。

| 俗称 | 代码真实身份 | 核心文件 |
|------|--------------|----------|
| Legacy | 顶层 `LEGACY` | `executionStrategy.ts:100` → `toolExecutor.ts:155` |
| ReAct | 顶层 `REACT`（含 Planner+Observer） | `executionStrategy.ts:123` → `reactExecutor.ts:472` |
| Planner | ReAct 内部规划子引擎 | `planner.ts` |
| Observer | ReAct 内部观察/反思子引擎 | `observer.ts` |
| AGENT（补充） | 顶层 `AGENT` | `executionStrategy.ts:185` → `agentOrchestrator.ts:86` |

## 2.2 统一入口 `runChatSession`

- 文件：`server/engine/runChatSession.ts`
  - `runChatSessionStream(input)` —— 行 236，返回细粒度流（`text_delta`/`thinking_delta`/`toolcall_end`/`done`/`error`）。
  - `runChatSession(input, callbacks)` —— 行 405，纯回调核心，HTTP 路由/gateway/ACP 共用。
- **分派（三向 map，行 412-416）**：`agent`→`AGENT`，`legacy`→`LEGACY`，其余→`REACT`。**不处理 `auto`**（auto 必须在抵达前由 `chatService.ts` 解析成具体值）。
- **横切逻辑**（行 405-789，策略无关）：熔断重置、会话/事件记录、关键词触发、模型自动选择+Key 轮换、Thinking 缓存、技能上下文、超时管理（`TimerManager`+`AbortController`，本地 300s/云 120s）。
- **真正执行跳转**：行 790/1250 调 `streamExecuteChat`（= `streamExecutor.executeChat`）→ `ExecutionStrategyFactory.create(mode)`。

## 2.3 四种策略流转

```
[HTTP /api/agent-chat] → chatService.ts 解析 executionMode(可能='auto')
        ↓
runChatSession(input, callbacks)        runChatSession.ts:405
  三向 map → 横切逻辑 → streamExecuteChat
        ↓
ExecutionStrategyFactory.create(mode)   streamExecutor.ts:286
        ↓
具体 Strategy.execute(strategyOptions)
```

- **LEGACY**（`executionStrategy.ts:100` → `toolExecutor.ts:155`）：剥离策略字段后 `executeToolLoop` 朴素"思考→工具→再思考"循环（最多 10 turn），**无 Planner/Observer**。
- **REACT**（`executionStrategy.ts:123` → `reactExecutor.ts:472`）：三阶段 `reasoning → acting → observing`（含 `reflecting/done`）。
  - 规划：`planningMode!=='off'` 且 `assessTrigger` 命中 → `generatePlan` → 注入 system 计划 → 发 `plan` 事件 → `syncPlanToTodos`（`reactExecutor.ts:525-550`）。
  - 观察：主循环 `observationPhase`（行 1167）对每个 `actionResult` 同步调 `observer.observe()`（RuleEngine 匹配 `OBSERVER_RULES`），结论驱动 `LoopDetector`/`CircuitBreaker`/`reflectionReplan`。
  - **降级**：`ReactStrategy` 失败 → `LegacyStrategy` + 发 `strategy_fallback` 事件。
- **AGENT**（`executionStrategy.ts:185` → `agentOrchestrator.ts:86`）：复杂度评估 → 无需拆分则降级 ReAct；否则 `executeDecomposition` 生成子任务 DAG → `executeSubTask` 按拓扑层级并行 → LLM 合成。子任务底层仍复用 ReAct/Observer/Planner。**降级**：`AgentStrategy` 失败 → `ReactStrategy`。
- **AUTO**（默认 `getDefaultMode()=AUTO`）：`resolveAutoMode()` 基于 `assessComplexity` 本地评估落地为 `AGENT/REACT/LEGACY`。

## 2.4 SSE / 事件发射统一层

- 类型中枢：`server/sse/sseTypes.ts`（8 核心事件 `CORE_EVENT_TYPES` 行 174-183：`init/text/thinking/tool_call/error/done/debug/file`；15 细粒度行 526-542）。
- 统一写出：`sendSSE(res, event)`（行 240）、`sendDebugSSE`（行 291，仅 `LOG_DEBUG=1`）、`sendDoneAndEnd`（行 311）。
- **所有策略通过 `streamExecutor.executeChat` 注入的回调统一发射**，策略内部不关心 HTTP/SSE：`onSSEEvent` 同时转发给 `callbacks.onSSEEvent` 与 `onEvent`（`streamExecutor.ts:296-299`），ReAct 专属 `react_phase/plan/observer_reflection/strategy_fallback` 与 8 核心事件走同一管线。

## 2.5 数字员工 `staffChatExecutor` 与主引擎关系

**复用同一内核，非独立实现**：
- `server/staff/staffChatExecutor.ts:17` `import { executeChat } from '../engine/streamExecutor.js'`。
- 行 296 **硬编码 `executionMode: REACT`** —— 数字员工强制走 ReAct 统一路径（含 Planner+Observer），不参与 `AUTO` 选型。
- 隔离边界：`buildStaffMcpManager`（专属 MCP）、`materializeGeneralSkills`（技能物化）、`sd_sessions/sd_messages`（独立落库）、persona。
- 兜底：无 Key 时走 mock（`staffChatExecutor.ts:248`）。

## 2.6 核心坐标速查

| 关注点 | 路径 | 关键行 |
|--------|------|--------|
| 统一入口（流） | `server/engine/runChatSession.ts` | 236, 405, 412-416, 790 |
| 策略框架/枚举/工厂 | `server/engine/executionStrategy.ts` | 29-38, 100-217, 224-316 |
| 统一执行器 | `server/engine/streamExecutor.ts` | 286, 296-299, 300-343 |
| Legacy 主循环 | `server/engine/toolExecutor.ts` | 155 |
| ReAct 循环 | `server/engine/reactExecutor.ts` | 62, 472, 525-550, 1167 |
| Planner 子引擎 | `server/engine/planner.ts` | 146, 241, 308, 381, 504 |
| Observer 子引擎 | `server/engine/observer.ts` | `observe()` RuleEngine |
| AGENT 编排 | `server/engine/agentOrchestrator.ts` | 67, 86, 382, 530, 824 |
| SSE 类型/写出 | `server/sse/sseTypes.ts` | 161-183, 240, 291, 311, 526-542 |
| HTTP 路由解析 | `server/routes/chatService.ts` | 423-462, 464-518, 551-554 |
| 数字员工 | `server/staff/staffChatExecutor.ts` | 17, 248, 279, 282, 296 |
| 端口解析 | `server/index.ts` | 705（`resolveServerPort`） |
| 启动崩溃点(已修) | `server/services/skillMdParser.ts` 等 7 文件 | `import * as yaml` |

---

## 附录：本次改动文件清单（均未提交 git）

**端口根治 + js-yaml 启动崩溃修复：**
- `server/index.ts`（resolveServerPort，端口兼容）
- `server/services/skillMdParser.ts`、`server/services/docQualityChecker.ts`、`server/services/openclaw/skillMetadata.ts`、`server/routes/skills.ts`、`server/cli/commands/skills.ts`、`server/engine/cli/skills-cli.scanner.ts`、`scripts/test-skill-parser.mjs`（js-yaml 导入修复）
- `.env.example`（端口文档同步）
- `e2e/api/smoke.e2e.test.ts`（随机空闲端口）

> ⚠️ 所有改动仍未提交 git，建议统一提交（本次修复使整跑 e2e 首次全绿，价值高）。
