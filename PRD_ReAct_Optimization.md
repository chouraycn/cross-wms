# PRD: ReAct 循环优化 — cross-wms AI Agent 思考流程升级

## 1. 项目信息

| 字段 | 值 |
|------|-----|
| 语言 | 中文 |
| 编程语言 | TypeScript (React + Vite 前端 / Express 后端) |
| 项目名称 | cross-wms-react-optimization |
| 原始需求 | 将 AI Agent 的思考流程从简单"问答"升级为结构化 ReAct（Reasoning + Acting）循环，落地 8 项优化 |
| 技术栈 | React 18 + Vite 7 + Express 5 + MUI 5 + Tailwind CSS + better-sqlite3 + pywebview 桌面壳 |

**原始需求复述**：
cross-wms 是桌面端 AI 问答应用，当前有 v4.0 级别的 ReAct + Observer + Planner 框架（已占位），但实际执行仍以 Legacy/Observer 模式为主。需要将 ReAct 循环从占位状态升级为生产就绪，落地 8 项优化：反思早停、上下文记忆管理、Action 并行化、动态重规划、Reasoning 效率优化、Observation 压缩、自动评估评分、工具生态增强。

---

## 2. 产品定义

### Product Goals

| # | 目标 | 说明 |
|---|------|------|
| G1 | **提升 Agent 解决问题的效率** | 通过早停机制、并行执行、简单任务跳过 Reasoning，让 Agent 不浪费时间在不需要的循环上 |
| G2 | **防止 Agent 死循环与资源浪费** | 通过置信度打分、死循环检测、预算管理、熔断机制，确保 Agent 不会无限消耗 token 和时间 |
| G3 | **增强 Agent 的记忆与经验积累能力** | 通过 Working Memory 滑窗、长期 Memory 向量库、Few-shot 注入，让 Agent 越用越聪明 |

### User Stories

| # | 角色 | 功能 | 价值 |
|---|------|------|------|
| US1 | 仓库管理员 | 我想问一个简单问题（如"某 SKU 当前库存"）时，AI 能直接回答而不是走完整四步 ReAct 循环 | 简单问题秒回，不浪费等待时间 |
| US2 | 仓库管理员 | 我想执行复杂跨仓调拨任务时，AI 能自动规划步骤并按 DAG 顺序执行，步骤间并行加速 | 复杂任务更快完成，执行过程清晰可视 |
| US3 | 仓库管理员 | 我想在对话中途修改需求或补充信息时，AI 能识别偏离并自动重规划，而不是固执执行旧计划 | 对话灵活，需求变更不被忽略 |
| US4 | 系统管理员 | 我想控制 AI Agent 的资源消耗（token、时间），避免一个复杂查询吃掉整个预算 | 成本可控，不会因为一个任务导致资源耗尽 |
| US5 | 仓库管理员 | 我想 AI 能记住我之前的偏好和习惯（如常用仓库、报表格式），下次对话直接应用 | 越用越懂我，减少重复描述 |

---

## 3. 技术规范

### 现有架构关键节点

| 模块 | 文件 | 当前状态 |
|------|------|----------|
| 执行策略 | `server/engine/executionStrategy.ts` | 已有 4 种策略（Legacy / Observer / Planner / ReAct），工厂模式就绪 |
| ReAct 执行器 | `server/engine/reactExecutor.ts` | 四步循环（Reasoning → Acting → Observing → Reflecting）已实现，但无早停/置信度/并行 |
| Observer | `server/engine/observer.ts` | 纯规则引擎匹配，无置信度打分，无死循环检测 |
| Planner | `server/engine/planner.ts` | 触发评估 + LLM 规划 + 规则动态调整，但 ReAct 循环中不触发重规划 |
| 上下文截断 | `server/engine/contextTruncate.ts` | 已有 token 截断，但无滑窗/压缩/向量库 |
| 前端类型 | `src/types/chat.ts` | 已有 `ObserverReflectionInfo`、`ExecutionPlanInfo`、`ReactPhaseInfo` 类型 |
| 前端 Hook | `src/hooks/useChat.ts` | 已处理 SSE 事件（`observer_reflection`、`execution_plan`、`plan_step_update`、`react_phase`） |
| 自动记忆 | `server/routes/chat.ts` → `extractAndAppendMemory()` | 已有 MEMORY.md 自动学习，但非向量库 |

### 需求池（Requirements Pool）

#### P0 — 立竿见影（必须实现）

| ID | 需求 | 详细描述 | 涉及模块 | 验收标准 |
|----|------|----------|----------|----------|
| P0-1 | 反思早停机制 | Reflection 阶段加入置信度打分（1-10），≥7 直接输出，简单问题不绕完整四步 | `reactExecutor.ts` → `reflectionPhase()` | 1. Reflection 输出 `confidenceScore` 字段；2. ≥7 时跳过后续循环直接返回；3. 前端 SSE 新增 `reflection_confidence` 事件 |
| P0-2 | 死循环检测 | 连续 3 轮 Observation 无实质变化（相同错误/输出），强制升级：换工具/触发重规划/问用户 | `reactExecutor.ts` → `shouldTerminateByConsecutiveErrors()` 增强 | 1. 检测逻辑从"同一工具名连续失败"升级为"同一错误类型 + 结果 diff ≤阈值"；2. 升级策略：尝试换备选工具 → 触发 Planner 重规划 → 向用户请求澄清 |
| P0-3 | 预算管理 | 设置 `max_turns` 和 `max_tokens` 上限，超限输出当前最优结果 + 标注"未完全解决" | `reactExecutor.ts` + `executionStrategy.ts` | 1. 新增 `budgetConfig` 参数（maxTurns=10, maxTokens=50000）；2. 每轮累计 token 消耗；3. 超限时返回 `budgetExceeded` 标记 + 最优结果 |
| P0-4 | Working Memory 滑窗 | 只保留最近 K 轮 Observation，更早的压缩为摘要注入上下文 | `contextTruncate.ts` + 新增 `workingMemory.ts` | 1. 默认 K=5；2. 超出 K 的旧轮次调用 LLM 压缩为一段 ≤200 字摘要；3. 前端 SSE 新增 `context_compressed` 事件 |
| P0-5 | Action 并行化 | 独立工具调用合并为一批并行执行；重试+熔断：失败自动重试 1 次，连续失败标记不可用 | `reactExecutor.ts` → `actionPhase()` | 1. 分析 tool_calls 依赖关系，无依赖的并行执行（Promise.all）；2. 单工具失败重试 1 次；3. 连续 3 次失败标记工具不可用，跳过后续调用 |
| P0-6 | Planner 动态重规划 | Reflecting 阶段检测偏离时自动重跑 Planner；输出 DAG 而非线性列表 | `reactExecutor.ts` → `reflectionPhase()` + `planner.ts` | 1. Reflection 评估 `shouldReplan=true` 时调用 `planner.generatePlan()`；2. Plan.steps 的 `dependsOn` 字段已存在，升级为 DAG 拓扑执行；3. 前端 SSE 新增 `replan_triggered` 事件 |

#### P1 — 锦上添花（应该实现）

| ID | 需求 | 详细描述 | 涉及模块 | 验收标准 |
|----|------|----------|----------|----------|
| P1-1 | 简单任务跳过 Reasoning | 任务复杂度评估（基于历史工具调用次数、消息长度）→ 简单任务直接 Action | `executionStrategy.ts` → 策略选择逻辑 | 1. 新增 `assessComplexity()` 方法；2. 简单任务（estimatedSteps ≤ 1）直接走 Legacy/Observer 模式；3. 前端 SSE 新增 `complexity_assessment` 事件 |
| P1-2 | Few-shot 示例注入 | 根据任务类型注入 system prompt 中的 Few-shot 示例（WMS 查询、文件操作等） | `chat.ts` → 消息构建 + 新增 `fewShotTemplates.ts` | 1. 预置 5-8 个 Few-shot 模板；2. `assessTrigger()` 匹配后注入对应模板；3. 注入后首轮 Reasoning 准确率提升 |
| P1-3 | Observation 结果压缩 | 超长工具输出（>500 字）自动压缩为 Top-K 关键信息 | `reactExecutor.ts` → `observationPhase()` + 新增 `observationCompressor.ts` | 1. 压缩策略：提取 JSON key-value、表格 Top-5 行、文本 Top-3 段落；2. 压缩后 ≤200 字；3. 前端可展开查看原始结果 |
| P1-4 | 结构化输出校验 | 工具返回值不匹配预期 schema 时自动重试（最多 1 次） | `toolExecutor.ts` / `toolRegistry.ts` | 1. 每个工具新增 `outputSchema`（Zod schema）；2. 校验失败自动重试 1 次 + 提示修正；3. 重试仍失败则标记 error |
| P1-5 | 每轮 Reflection 自评分 | 每轮 Reflection 输出 `selfScore`（1-10），附带到 SSE 和最终结果 | `reactExecutor.ts` → `reflectionPhase()` | 1. Reflection prompt 增加"请评估本轮进展质量 1-10"；2. 分数随 SSE 推送前端；3. 最终结果附带 `averageSelfScore` |
| P1-6 | 小模型 Judge（可选） | 用低成本模型（如 GPT-4o-mini）对每轮 Reflection 做独立评分 | 新增 `judgeModel.ts` | 1. 可选功能，设置中开关；2. Judge 模型独立评分，与 selfScore 取加权平均；3. Judge 评分 ≤3 时触发终止或重规划 |

#### P2 — 长期建设（可以实现）

| ID | 需求 | 详细描述 | 涉及模块 | 验收标准 |
|----|------|----------|----------|----------|
| P2-1 | 工具 Schema 完整化 | 每个工具带 `input_schema` + `output_schema` + 使用示例 | `toolRegistry.ts` 工具定义 | 1. 所有 24+ 内置工具补充 Zod outputSchema；2. 每个工具补充 1-2 个使用示例；3. Schema 作为 tool definition 的一部分传递给 LLM |
| P2-2 | 复合工具预编译 | 自动发现高频工具组合（如 db_query + wms_inventory），预编译为复合工具 | 新增 `compositeToolDiscovery.ts` + `compositeToolRegistry.ts` | 1. 统计最近 100 次对话中工具调用序列；2. 高频组合（出现 ≥5 次）自动注册为复合工具；3. 复合工具在 Planner 中可用 |
| P2-3 | 长期 Memory 向量库 | 历史经验、工具使用记录存向量库，Reasoning 阶段按需 RAG 检索注入 | 新增 `vectorMemory.ts`（基于 sqlite-vec，已依赖） | 1. 工具调用结果存入 sqlite-vec；2. Reasoning 前检索 top-3 相关经验注入；3. 前端 SSE 新增 `memory_retrieved` 事件 |

---

## 4. UI 设计稿（描述）

### 4.1 ReAct 阶段进度条

**位置**：对话消息气泡顶部，当 AI 进入 ReAct 模式时显示

**布局**：
- 横向进度条，分 4 段：🧠 Reasoning → 🔧 Acting → 👁 Observing → 🔍 Reflecting
- 当前阶段高亮，已完成阶段灰显 + 对勾
- 每段下方小字显示阶段描述（如"正在查询库存数据…"）
- 置信度分数（P0-1）：Reflecting 段旁显示 `置信度: 8/10` 标签

**交互**：
- 点击已完成阶段可展开查看该阶段的详细日志（工具调用、观察结果）
- 预算超出时（P0-3）：进度条变橙色 + 标注"⚠️ 预算已达上限，输出当前最优结果"

### 4.2 执行计划面板

**位置**：对话消息气泡内，Planner 生成执行计划时显示

**布局**：
- 纵向步骤列表，每个步骤包含：序号、描述、推荐工具图标、状态标签（pending/in_progress/completed/failed）
- 依赖关系用连线标注（DAG 可视化）
- 重规划触发时（P0-6）：计划面板上方标注"🔄 因偏离原计划，已重新规划"

**交互**：
- 点击步骤展开查看执行详情
- 失败步骤显示红色 + 原因说明
- 动态重规划时新步骤自动插入，带"新增"标签

### 4.3 设置页面新增项

**位置**：系统设置 → AI 引擎设置

**新增控件**：
| 控件 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| 默认执行模式 | 下拉选择 | Legacy | Legacy / Observer / Planner / ReAct |
| 最大循环轮数 | 数字输入 | 10 | P0-3 预算管理 |
| 最大 Token 预算 | 数字输入 | 50000 | P0-3 预算管理 |
| Working Memory 滑窗大小 | 数字输入 | 5 | P0-4 K 值 |
| 小模型 Judge | 开关 | 关闭 | P1-6 |
| Judge 模型选择 | 下拉选择 | - | P1-6，仅开关开启时显示 |

---

## 5. 待确认问题（Open Questions）

| # | 问题 | 影响范围 | 建议 |
|---|------|----------|------|
| Q1 | 长期 Memory 向量库用 sqlite-vec 还是外部向量数据库？ | P2-3 | 当前项目已依赖 `sqlite-vec`，建议先用 sqlite-vec 实现，避免引入外部服务 |
| Q2 | Observation 压缩策略是否需要 LLM 辅助？纯规则 vs LLM 压缩 | P1-3 | 纯规则压缩（提取 key-value/Top-K）成本为 0，LLM 压缩更准但消耗 token。建议 P1 先用纯规则，P2 考虑 LLM 辅助 |
| Q3 | 并行执行时权限请求如何处理？多个高风险工具同时请求 | P0-5 | 并行工具中如有高风险工具，需串行处理权限请求。建议：并行组中分"免权限组"并行 + "需权限组"串行 |
| Q4 | 预算管理中 max_tokens 的计算方式：按 prompt+completion 累计还是仅 completion？ | P0-3 | 建议按 total_tokens 累计（prompt+completion），因为上下文膨胀主要消耗 prompt tokens |
| Q5 | ReAct 模式是否作为默认模式？还是保持 Legacy 默认、用户手动切换？ | 全局 | 建议保持 Legacy 默认，ReAct 作为可选模式。因为 ReAct 循环消耗更多 token，不适合所有场景 |
| Q6 | 小模型 Judge 的评分与 selfScore 的权重比例？ | P1-6 | 建议 selfScore 权重 0.6 + Judge 权重 0.4。selfScore 反映 Agent 自身判断，Judge 提供第三方校验 |
| Q7 | 复合工具的注册时机：实时统计还是离线批量分析？ | P2-2 | 建议离线批量分析（启动时统计最近 100 次对话），避免实时统计影响对话性能 |
| Q8 | 死循环检测的"结果 diff"阈值如何定义？文本相似度还是语义相似度？ | P0-2 | 建议先用文本相似度（Levenshtein distance / 字符级 Jaccard），语义相似度需向量库，P2 再升级 |