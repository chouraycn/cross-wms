# ReAct v6.0 完成度与分叉报告

> 范围：CDFKnowClow 产品（cross-wms）的 ReAct 引擎 + `@cdf-know/*` 包级测试
> 日期：2026-07-08
> 背景：`PRD_ReAct_Optimization.md` / `ARCH_ReAct_Optimization.md` 已就绪，但实现已**偏离**这两份设计文档

---

## 1. 一句话结论

ReAct v6.0 的**后端引擎核心已实现，且是产品默认执行模式**（Legacy/ReAct/Agent 三策略中 ReAct 为 `getDefaultMode()`）。但实现**不是** PRD/ARCH 描述的 T01–T05 形态，而是一次**重新架构**：8 项优化里约 5 项后端机制已落地、约 3 项关键能力被有意关闭或缺失、**前端 T04 完全未建**。因此不能按"从零实现 PRD"理解，应按"对齐真实代码"理解。

---

## 2. 实际架构 vs PRD/ARCH 差异

| PRD/ARCH 设计 | 实际代码 | 偏差 |
|---|---|---|
| 单一 `reactExecutor` 主循环内插 hook | `reactExecutor` 主循环 + `ActionPhaseExecutor`（独立文件）承担并行 | 拆分更合理 |
| `reflectionPhase()` 产 confidenceScore/selfScore 并早停 | **反思阶段被关闭**（见 `reactExecutor.ts:12` 注释"移除 reflectionPhase/llmReflect/selfEvaluation"） | **关键能力关闭** |
| `planner.detectDrift()/replan()/topologicalSort()` | `planner.ts` **无** 这三个方法 | **动态重规划未实现** |
| T04：新建 `ReactPhaseIndicator.tsx` + `ExecutionPlanPanel.tsx` 并接入 `useChat.ts` | 两个组件**不存在**；事件消费端是 `ChatContext.tsx`，且**未处理** 5 个新事件 | **前端完全缺失** |
| P0-5 并行用 Promise.all + 重试 + 熔断（简单） | `ActionPhaseExecutor` 用 Promise.all + **CircuitBreaker 分组熔断**（auto/confirm/high-risk） | 实现**优于** PRD |

---

## 3. 8 项优化逐项状态（基于真实代码核查）

| ID | 优化 | 状态 | 证据 |
|---|---|---|---|
| P0-1 | 反思早停（confidenceScore≥7） | ⚠️ 部分 | `reactExecutor` 有 `confidenceScore` 字段，但 reflection 阶段被关闭 → 早停逻辑未激活 |
| P0-2 | 死循环检测 | ✅ 已落地 | `loopDetector.ts`（312 行）+ `reactExecutor` 引用 + 单测 |
| P0-3 | 预算管理 | ✅ 已落地 | `budgetManager.ts`（223 行）、`reactExecutor` 发射 `budget_exceeded`、`executionStrategy` 透传 `budgetConfig`、单测 |
| P0-4 | Working Memory 滑窗 | ✅ 已落地 | `workingMemory.ts`（275 行），`reactExecutor` 引用（14 处），经 `contextCompress` 集成 |
| P0-5 | Action 并行化 | ✅ 已落地（超规格） | `actionPhaseExecutor.ts`：Promise.all + CircuitBreaker 分组熔断 |
| P0-6 | Planner 动态重规划 | ❌ 未实现 | `planner.ts` 无 `detectDrift`/`replan`/`topologicalSort` |
| P1-1 | 简单任务跳过 Reasoning | ❌ 未实现 | `executionStrategy` 无 `assessComplexity`；默认即 REACT，无降级 |
| P1-2 | Few-shot 注入 | ✅ 已落地 | `fewShotTemplates.ts`（350 行）存在 |
| P1-3 | Observation 压缩 | ✅ 已落地 | `observationCompressor.ts`（241 行）被 `reactExecutor` import |
| P1-4 | 结构化输出校验 | ⏸ 未深查（P2 预留） | ARCH 将其列为 P2 接口预留，未在本次范围核实 |
| P1-5 | 每轮自评分 | ⚠️ 部分 | 依赖 reflection，reflection 关闭 → 未激活 |
| P1-6 | 小模型 Judge | ⏸ 可选/未核实 | PRD 标为可选开关，未核实是否实现 |
| T04 | 前端 UI（进度条/计划面板/SSE 消费） | ❌ 未实现 | `ReactPhaseIndicator`/`ExecutionPlanPanel` 不存在；`ChatContext.tsx` 未消费新事件 |

**汇总**：后端机制 ≈ 5/8 到位（P0-2/3/4/5、P1-2/3）；3 项核心能力关闭/缺失（P0-1、P0-6、P1-1、P1-5、T04 计 5 项"未完全达成"）；前端 0%。

---

## 4. 三个真实缺口（需决策如何收尾）

### 缺口 A — 反思阶段被有意关闭
`reactExecutor.ts:12` 注释明确"反思阶段默认关闭（移除 reflectionPhase / llmReflect / selfEvaluation）"。这直接使 **P0-1 置信度早停** 与 **P1-5 自评分** 失效。
- 推测原因：reflection 每轮多一次 LLM 调用的 token 成本（与 PRD 开放问题 Q5"ReAct 消耗更多 token"一致）。
- 影响：早停/自评分作为"防死循环、提效"的关键杠杆缺失。

### 缺口 B — Planner 动态重规划未实现
`planner.ts` 没有 `detectDrift` / `replan` / `topologicalSort`。P0-6（偏离时自动重规划、DAG 拓扑执行）完全未落地。当前 Planner 仅用于初始计划生成，ReAct 循环内不触发重规划。

### 缺口 C — 前端 T04 完全缺失
- `ReactPhaseIndicator.tsx` / `ExecutionPlanPanel.tsx` 不存在。
- `ChatContext.tsx` 仅有一行注释提及 `react_phase`，**未实际消费** `reflection_confidence` / `budget_exceeded` / `complexity_assessment` / `replan_triggered` / `context_compressed`。
- 后端已发射这些事件、类型已在 `src/types/chat.ts` 定义，但用户在前端**完全看不到** ReAct 过程可视化。

---

## 5. 本次已完成的包级测试补齐（P1 明确可交付部分）

为三个测试稀缺的 `@cdf-know/*` 包补写 vitest 单测，全部 run 通过（无回归）：

| 包 | 原测试文件 | 新增测试文件 | 结果 |
|---|---|---|---|
| `@cdf-know/agent-core` | 1（agent） | +4（reasoning / agent-loop / tracer / runtime-deps） | **29 passed** |
| `@cdf-know/llm-core` | 1（model-catalog） | +3（usage / provider / streaming） | **26 passed** |
| `@cdf-know/memory-host-sdk` | 1（query） | +3（advanced-search / clustering / events） | **20 passed** |

（plugin-sdk / skill-core 原本已有 9 / 5 个测试，覆盖较好，本次未动。）

---

## 6. 后续建议（待确认方向）

P2 治理（submodule / npm / 维持硬 fork）维持原结论：**ReAct 稳定前不切换地基**。当前真正待决的是"三大缺口如何收尾"：

- **选项 1 — 按 PRD/ARCH 收尾**：重建 T04 前端两组件 + 接入 `ChatContext` 消费 5 事件；在 `planner.ts` 补 `detectDrift/replan/topologicalSort`；确认并重新启用 reflection 早停/自评分。工作量大、且重启用 reflection 会重新引入 token 成本（需评估是否值得）。
- **选项 2 — 接受现状、对齐文档**：reflection 关闭若是有意决策，则更新 `PRD/ARCH` 使其与真实架构一致，标记 v6.0 核心完成；仅补**缺口 C 的最小前端可见性**（让现有 phase/budget 事件可见），缺口 A/B 作为已知限制记录。
- **选项 3 — 仅补最小可见性**：只做缺口 C（前端消费现有事件 + 轻量进度条），A/B 留待 v6.1。风险最低、收益直接。

> 建议先确认 **缺口 A 的 reflection 关闭是否为有意决策**（查 git blame / 设计评审），再决定走选项 1 还是 2。盲目重启用 reflection 可能抵消已实现的"省 token"收益。
