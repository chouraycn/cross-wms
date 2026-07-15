# SSE 架构重构 + 日志可追溯性注入 — 架构评审与执行报告

**日期**：2026-07-14
**场景**：架构重构 / 代码审查 / 调试复盘（a: sendErrorEvent 语义；b: SSE 双实现合并；c: sessionId/requestId 注入）
**参与成员**：产品官（产品评审）+ 安全卫士（OWASP/STRIDE）+ 排障手（调试/可观测性）

> 说明：本环境未注册原生 `gstack-*` 子 agent，按既定降级路径由主理人直接研判并汇编，三视角按成员框架组织（非模拟成员发言）。

---

## 📌 TL;DR（执行摘要）

- 整体结论：🟢 通过（无行为变化，风险已收敛）
- 阻塞项数量：0
- 验证：`tsc --noEmit` 零错误；`sseStreaming` 18/18、`chatService` 28/28 全绿（共 46/46）
- 下一步：建议将本批改动与此前 3 项 debug 修复合并为一次 fix commit

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| Go / No-Go | 🟢 Go |
| 严重度分布 | 🔴 0 / 🟠 0 / 🟡 0 / 🟢 3（3 项均为低风险清理/增强） |
| 关键行动项 | 3 条（见行动清单） |
| 建议负责人 | 寇豆码（后端） |

---

## 1. 各成员核心结论

### 🔍 产品官（产品评审）
- 核心判断：(a)+(b) 实质是死代码清理——`sendErrorEvent`/`sendSSEEvent`/`sendDoneEvent` 经全仓 grep 确认**零外部调用**；合并后 SSE 写入只剩 `sseTypes` 一套，维护面收敛。
- 关键建议：直接删除即可，零行为变化；未来错误事件统一走 `sendSSE({type:'error',code,message})` + `sendDoneAndEnd`，与 `chatService.ts:650` 现状一致。

### 🛡️ 安全卫士（OWASP+STRIDE 审计）
- 核心判断：裸 `res.write` 会绕过 `sendDebugSSE` 的脱敏；超时事件虽无敏感字段，但合并后脱敏/门控/`writableEnded` 防护只有一处，长期更安全。(c) 注入 `sessionId` 时仍走 `sanitizeForDebug` 之后，标识字段不泄露。
- 关键建议：`sendDebugSSE` 新增 `sessionId` 在 sanitize 之后注入（非敏感字段），保持脱敏优先。

### 🔧 排障手（调试与根因）
- 核心判断：(c) 边界注入（方案 A）低风险高收益——`logger.child` 是 pino O(1) 子日志；Express 路由补 `requestId` 打通 gateway↔Express 链路，可按 `sessionId`/`requestId` 定位"哪个请求出错"。
- 关键建议：`runChatSession` 内部 `sendDebugSSE` 暂未带 `sessionId`，列为后续增强（方案 B / AsyncLocalStorage）。

---

## 2. 综合审查发现（去重合并后按严重度排序）

| # | 严重度 | 类别 | 位置 | 问题描述 | 建议 | 来源成员 |
|---|--------|------|------|---------|------|---------|
| 1 | 🟢 | 代码健康 | `server/routes/chatHelpers/sseHelper.ts` | `sendErrorEvent` 发 `type:'done'`（语义反向），且为死代码 | 删除 | 产品官 / 排障手 |
| 2 | 🟢 | 架构 | `server/routes/chatHelpers/sseHelper.ts` | SSE 双实现（裸 `res.write` + `sseTypes`） | 删除死函数，超时清理改走 `sendSSE` | 排障手 |
| 3 | 🟢 | 可观测性 | `logger.ts` / `sseTypes.ts` / `chatService.ts` | 日志与调试事件缺 `sessionId`/`requestId` | 加 `logger.child` + `sendDebugSSE(sessionId)` | 安全卫士 / 排障手 |

---

## ✅ 行动清单（具体可执行项）

| # | 行动 | 负责方 | 紧急度 | 期望完成 |
|---|------|--------|--------|---------|
| 1 | 删除 sseHelper 三个死函数，超时清理改走 `sendSSE`，导出仅留 `activeSSEConnections` | 寇豆码 | P0 | ✅ 已完成 |
| 2 | `logger` 增加 `child()`；`chatService` 入口建 `requestId` + `reqLog`，日志与调试事件注入 `sessionId`+`requestId` | 寇豆码 | P0 | ✅ 已完成 |
| 3 | `runChatSession` 内部调试事件补 `sessionId`（评估方案 B / AsyncLocalStorage 全量注入） | 寇豆码 | P2 | 后续 |

---

## ⚠️ 待完善 / 已知局限

- `runChatSession` 内部 `sendDebugSSE` 调用未带 `sessionId`，本次边界注入未覆盖；其调试事件由内部直接发出，需另开 PR 注入。
- AsyncLocalStorage 请求作用域方案（方案 B）未实施，当前为边界注入，覆盖面为主路径。
- 此前 3 项 debug 修复（`retry-queue`/`lifecycle-manager`/`pipeline` 的 `console→logger`、`sseTypes` 脱敏、`queue_event` 修正）与本批改动同在工作区、尚未提交。

---

## 📚 成员产出索引

- 产品官 / 安全卫士 / 排障手 原始产出：本环境子 agent 不可用，由主理人直接研判汇编，无独立成员产出文件。

---

## 变更清单（代码）

| 文件 | 改动 |
|------|------|
| `server/logger.ts` | 新增 `Logger.child(bindings)`（pino child 封装），`logger` 改为工厂 `makeLogger` 产出 |
| `server/sse/sseTypes.ts` | `sendDebugSSE(res, event, sessionId?)` 增加可选 `sessionId`，注入调试事件包 |
| `server/routes/chatHelpers/sseHelper.ts` | 删除 `sendSSEEvent`/`sendDoneEvent`/`sendErrorEvent`；超时清理改走 `sendSSE`；队列事件注入 `sessionId`；导出仅留 `activeSSEConnections` |
| `server/routes/chatService.ts` | 入口建 `requestId`（`x-request-id` 头或 uuid）+ `reqLog = logger.child(...)`；请求级日志与 `sendDebugSSE` 调用注入 `sessionId`/`requestId` |
| `server/routes/__tests__/chatService.test.ts` | logger mock 补 `child` 方法，匹配新 API |

---

> 本报告由软件工坊 AI 协作生成，关键决策请由工程负责人复核。
