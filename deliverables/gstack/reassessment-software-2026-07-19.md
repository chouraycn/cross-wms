# CrossWMS / CDF Know Clow 软件现状专业评估（重新评估）

**日期**：2026-07-19
**场景**：软件现状重新评估（对照 2026-07-14 五维 No-Go 结论）
**参与成员**：主理人直接汇编（本环境未注册原生 `gstack-*` 子 agent，按既定降级路径由主理人研判五视角，不模拟成员发言）

---

## 📌 TL;DR（执行摘要）

- **整体结论：🔴 不通过（No-Go 维持）** —— 之前 10 项 🔴 严重 + 2 项 🟠 高危阻塞项**零项被真正解决**。
- 我们完成的 SSE/logger 重构属**代码健康改进**，已提交、测试 46/46 绿、类型安全，但**不在 P0 安全/发布阻塞清单内**。
- **新增风险**：工作区游离 64 个未提交 `server/engine/infra/*.ts` 模块（含安全模块 `host-env-security`/`path-guards`），无测试、未接入主干、server tsc 报 **5 个真实类型错误**（未定义符号引用），属"移植链未接完"的半成品技术债。
- 已提交代码质量可靠：server 独立类型检查（`server/tsconfig.json`，Jul 16 新建）**0 错误**，448 个测试文件，体系健全。
- 下一步：先清零 P0 安全阻塞（沙箱逃逸/HTTP 无鉴权/路径穿越）+ 发布回滚预案；再处置 64 个半成品 infra 模块。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| Go / No-Go | 🔴 No-Go（维持 2026-07-14 判定） |
| 严重度分布（对照前次） | 🔴 10 / 🟠 2 / 🟡 19 / 🟢 12（前次）；本次 **新增 🟠 半成品工作区风险 ×1** |
| 已解决阻塞项 | **0 / 12**（前次 No-Go 阻塞项均未被触动） |
| 已提交代码类型健康 | ✅ server tsc 0 错误 / 前端 tsc 0 错误 |
| 未提交代码类型健康 | ⚠️ 64 个 infra 文件含 5 个 TS 错误 |
| 测试覆盖 | 448 测试文件；本次 SSE+chatService 46/46 绿 |
| 建议负责人 | 安全卫士（P0 安全）+ 质量门神（回滚/E2E）+ 排障手（半成品模块处置） |

---

## 1. 各维度核心结论（基于 2026-07-19 现状）

### 🔍 产品官（产品评审）
- **核心判断**：产品身份仍三命名（CrossWMS / CDF Know Clow / cdf-know-clow），跨境高价值能力（多渠道支付、双海关申报、价格口径一致性）**依旧规划态/LLM 泛化覆盖，无结构化业务模块落地**。大规模 openclaw engine 层移植（569 commits，最近 15 全为 porting）正在进行，但属"框架基础设施"而非"跨境业务闭环"。
- **关键建议**：如实标注跨境能力为规划态；归一产品命名；移植收口后定义"用到才保留"的引擎裁剪策略。

### 🛡️ 安全卫士（OWASP+STRIDE 审计）
- **核心判断**：4 项 P0 安全阻塞**全部未触动**——插件 VM 沙箱逃逸（`Object.constructor('return process')()`）、插件权限自声明、本地 HTTP 无鉴权且绑定 0.0.0.0、WMS 路径穿越。值得注意的是：当前工作区已存在 `host-env-security.ts`（333 行真实环境变量过滤）、`path-guards.ts`、`install-safe-path.ts` 等**安全模块原材料**，但**未提交、无测试、未被主干引用**，不能算"安全加固完成"，仅为待接入素材。
- **关键建议**：P0 优先清零沙箱逃逸 + HTTP 鉴权 + 路径穿越；将 `path-guards`/`host-env-security` 接入主干并补测试后方可计为缓解。

### ✅ 质量门神（QA测试与发布）
- **核心判断**：质量门禁（lint/双 tsc/knip/WKWebView-lint/覆盖率）已就位，**server 独立 tsc 门禁 Jul 16 新建是重要补强**；448 测试文件体系健全。但**发布回滚预案仍缺位**（release.json minVersion 写死 1.0.0）、WKWebView 无 E2E 覆盖、DMG 背景竞态仍存——前次 No-Go 的发布 P0 未变。
- **关键建议**：建动态 minVersion + 保留近 3 版 DMG artifact；补 macos playwright/webkit 冒烟；将 64 个半成品 infra 模块纳入版本控制或明确舍弃，禁止长期游离。

### 🎨 设计师（设计系统与视觉）
- **核心判断**：theme.ts token 地基仍扎实，但双轨制（组件硬编码绕过 token）与 ChatThread `@keyframes tearOpen` 违反 WKWebView 约定**未修复**。设计维度无新增动作。
- **关键建议**：ChatThread 改 JS+transition；全量 borderRadius/阴影路由到 token。

### 🔧 排障手（代码健康诊断）
- **核心判断**：核心 SSE 防御链健壮（我们已删 `sseHelper` 死函数、收敛到 `sseTypes` 单一实现、脱敏+`writableEnded` 防护统一、logger 可追溯性增强）。**但 ESM/require 历史债务仍在**（pdfProcessor/documentTools 等运行时 `require` 残留），且 **64 个未提交 infra 文件暴露 5 个类型错误**——证明 porting 链未接完（引用 `PermissionExec`/`readSecretFileSync`/`NormalizedUsage` 等尚不存在的符号，且 `import ... with`/`import.meta` 与 commonjs 不兼容）。
- **关键建议**：先修 5 个 TS 错误（或暂搁置这批文件），再做 ESM/require 清理；接入或丢弃半成品模块，避免工作区长期脏状态。

---

## 2. 对照前次 No-Go 12 项阻塞 — 当前状态

| # | 前次严重度 | 类别 | 阻塞项 | 当前状态 | 变化 |
|---|-----------|------|--------|---------|------|
| 1 | 🔴 | 安全 | 插件 VM 沙箱逃逸 | 未解决 | — |
| 2 | 🔴 | 安全 | 插件权限自声明 | 未解决 | — |
| 3 | 🔴 | 安全 | 本地 HTTP 无鉴权 + 绑定 0.0.0.0 | 未解决 | — |
| 4 | 🔴 | 安全 | WMS 文件存储路径穿越 | 未解决（有 `path-guards` 原材料但未接入） | 🟡 有素材未落地 |
| 5 | 🔴 | 数据 | 双层存储一致性风险 | 未解决 | — |
| 6 | 🔴 | 产品 | 跨境高价值能力未落地 | 未解决 | — |
| 7 | 🔴 | 发布 | 无发布回滚预案 | 未解决 | — |
| 8 | 🔴 | QA | WKWebView 缺 E2E | 未解决 | — |
| 9 | 🔴 | 设计 | ChatThread @keyframes 违规 | 未解决 | — |
| 10 | 🔴 | 代码 | ESM/require 残留 | 部分缓解（SSE 链路已清，其他文件仍在） | 🟡 局部改善 |
| 11 | 🟠 | 安全 | 权限管线空壳（allow-all） | 未解决 | — |
| 12 | 🟠 | — | （前次第 12 项见原报告） | 见原报告 | — |
| + | 🟠 | 代码 | **64 个未提交 infra 半成品模块（5 TS 错误、无测试、未接入）** | **新增风险** | 🆕 本期发现 |

> 结论：**12 项前次阻塞 0 项被真正解决**，仅 #4/#10 出现"原材料/局部改善"信号；本期新增 1 项 🟠 半成品工作区风险。

---

## 3. 本期新增风险详述：64 个未提交 infra 模块

**事实**（2026-07-19 git status）：1 modified（`number-coercion.ts`，仅导出 `MAX_TIMER_TIMEOUT_MS`）+ 64 untracked，全部位于 `server/engine/infra/`（63 .ts + 1 .json）。

**性质判定**：
- 是 openclaw 移植的 engine infra 层模块集合（approval / path-guards / host-env-security / sqlite / node / pairing / tailnet / dns / windows 等）。
- 质量不低：`_openclaw-stubs.ts`（137 行）是设计良好的降级实现（注释清晰、明确降级原因）；`host-env-security.ts`（333 行）是真实环境变量安全过滤。
- **但游离于版本控制外、无测试、未被任何已提交代码 import**（grep 确认零引用）。

**server tsc 5 个错误（全部在未提交文件）**：
| 文件 | 错误 | 含义 |
|------|------|------|
| `host-env-security-policy.ts:3` | TS2823 | `import ... with {type:"json"}` 与 commonjs 不兼容 |
| `node-sqlite.ts:6` | TS1343 | `import.meta` 在 commonjs 下不允许 |
| `permissions.ts:40` | TS2552 | 找不到 `PermissionExec`（符号未定义） |
| `secret-file.ts:21` | TS2552 | 找不到 `readSecretFileSync`（应为 `tryReadSecretFileSync`？） |
| `session-cost-usage.types.ts:2` | TS2305 | `../agents/usage.js` 未导出 `NormalizedUsage` |

> 这 5 个错误（3 个"找不到符号"+2 个语法/模块冲突）直接证明：**这批文件相互引用了尚未创建/未导出的符号，是 porting 链中"还没接完"的环节，不可贸然提交。**

---

## 4. 综合审查发现（去重合并）

| # | 严重度 | 类别 | 位置 | 问题描述 | 建议 | 来源 |
|---|--------|------|------|---------|------|------|
| 1 | 🔴 | 安全 | pluginSandbox.ts / server/index.ts / secretsService.ts | 沙箱逃逸、HTTP 无鉴权、0.0.0.0 绑定 | 独立子进程隔离 / 127.0.0.1 + 全 /api 鉴权 | 安全卫士 |
| 2 | 🔴 | 发布 | release.json | 无回滚预案 | 动态 minVersion + 保留近 3 版 DMG | 质量门神 |
| 3 | 🟠 | 代码 | server/engine/infra/*.ts（64 未提交） | 半成品模块游离：5 TS 错误、无测试、未接入 | 修错误 or 暂 gitignore 搁置，禁止长期脏状态 | 排障手 |
| 4 | 🟡 | 安全 | host-env-security / path-guards | 安全模块原材料已存在但未接入未测试 | 接入主干 + 补测试后计缓解 | 安全卫士 |
| 5 | 🟡 | 代码 | pdfProcessor/documentTools 等 | ESM/require 残留（dev/prod 不一致根因） | 统一 import/import() | 排障手 |

---

## ✅ 行动清单（按优先级）

| # | 行动 | 负责方 | 紧急度 | 期望完成 |
|---|------|--------|--------|---------|
| 1 | 处置 64 个未提交 infra 模块：修 5 个 TS 错误并决定是否提交/接入，或暂移出工作区避免长期脏状态 | 排障手 | P0 | 本周 |
| 2 | 清零 P0 安全阻塞：插件沙箱逃逸 + 本地 HTTP 鉴权/绑定 + WMS 路径穿越 | 安全卫士 | P0 | 下迭代 |
| 3 | 建发布回滚预案（动态 minVersion + 近 3 版 DMG 保留） | 质量门神 | P0 | 下迭代 |
| 4 | 将 `host-env-security`/`path-guards` 接入主干并补单测，方可计为安全缓解 | 安全卫士+排障手 | P1 | 2 周内 |
| 5 | 补 WKWebView E2E 冒烟 + ChatThread @keyframes 改 transition | 质量门神+设计师 | P1 | 2 周内 |
| 6 | ESM/require 残留清理（pdfProcessor 等）+ 引擎"用到才保留"裁剪 | 排障手 | P2 | 后续 |
| 7 | 跨境能力如实标注规划态 or 补结构化业务模块 | 产品官 | P2 | 后续 |

---

## ⚠️ 待完善 / 已知局限

- 本评估基于静态代码核查 + server/前端 tsc 门禁 + 针对性测试，**未运行全量 vitest**（448 文件耗时，且非本次重点）；全仓测试通过率未重测。
- 64 个未提交 infra 文件未做人工逐文件审查，仅抽样（stub/security 代表文件）+ tsc 量化判定半成品状态。
- 前次五维分析的 🟡/🟢 级发现（19+12 项）本次未逐条复核，默认维持原结论（非阻塞项）。
- 降级说明：本环境无原生 `gstack-*` 子 agent，五视角由主理人基于代码事实直接研判，非成员独立产出。

---

## 📚 成员产出索引

- 主理人汇编（降级路径，环境无原生子 agent）：本报告
- 前次五维分析原始产出：`deliverables/gstack/software-analysis-crosswms-2026-07-14.md`
- 本轮回溯的 SSE/logger 重构产出：`deliverables/gstack/arch-refactor-sse-logger-2026-07-14.md`

---

> 本报告由软件工坊 AI 协作生成，关键决策请由工程负责人复核。
