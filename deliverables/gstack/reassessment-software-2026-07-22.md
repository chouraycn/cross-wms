# CrossWMS 软件现状重新评估（2026-07-22）

**日期**：2026-07-22
**场景**：软件完整度重新评估（单主理人降级执行，原生 gstack 子 agent 环境不可用）
**基线对照**：`software-analysis-crosswms-2026-07-14.md`（🔴 No-Go）、`reassessment-software-2026-07-19.md`（🔴 No-Go 维持）

---

## 📌 TL;DR

- **判定：🔴 No-Go 维持，且因类型健康严重恶化而风险升级。**
- **最严重新发现**：server 类型检查从 07-20 的 9 错误暴增到 **1894 错误 / 216 文件**，其中 **162 文件是已提交代码**（工作区无改动）——最近 commit（"补全CLI+国内社交通道"）在未过 `server/tsconfig.json` 门禁的情况下合入了大量半成品移植代码。
- **我们的修复完好**：SSE/logger 5 文件已提交、`sseStreaming + chatService` 测试 **46/46 绿**。
- **安全 P0 部分缓解但核心仍在**：`host-env-security`/`path-guards` 已接入主干（07-19 半成品已升级）；但 HTTP 监听仍无显式 host（默认绑所有接口）、chat 路由仍无鉴权。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| Go / No-Go | 🔴 No-Go（风险升级） |
| 类型健康 | 🔴 server tsc **1894 错误 / 216 文件**（162 文件属已提交代码） |
| 我们的修复 | 🟢 已提交，测试 46/46 绿 |
| 安全 P0 缓解 | 🟡 部分（host-env/path-guards 接入；HTTP 绑定+鉴权未解） |
| 工作区状态 | 🟡 318 变更（148 M + 170 ??），skills 可观测性功能开发中 |
| 阻塞项 | 12 项 P0/🟠（8 项未解决 + 2 项局部 + 本期新增类型债） |

---

## 1. 当前工作区状态（2026-07-22）

### 1.1 Git 状态

| 维度 | 数值 | 说明 |
|------|------|------|
| 总变更文件 | 318 | 148 modified + 170 untracked |
| 已提交 commit | `2ba64c2` "补全CLI命令+国内社交通道(微信/QQ)" | 版本 1.7.129 |
| 我们的 5 文件 | ✅ 已提交（`git diff HEAD` 为空） | logger.child / sseHelper 死函数已删 / sseTypes sessionId 均在 |
| stash | 1 个 lint-staged backup | — |

### 1.2 变更性质分类

- **148 modified**：77 md（文档）+ 57 ts + 4 tsx + 4 swift + 其他。集中在 `server/engine/skills`、`server/engine/infra`、`apps/macos`。
- **170 untracked**：149 ts + 7 tsx + 目录。集中在 `server/engine/skills`（97 文件）+ `src/pages` 的 Skill 健康度/分析新页面（SkillHealthDashboard / SkillUsageAnalytics / SkillDocQuality / SkillDependencyGraph / IntegrationDashboard）。
- **性质**：是一场 **skills 可观测性 + 分析能力**的大型功能开发（已接入主干：`routes/skills-api.ts` + `App.tsx` + `services/api.ts` 均引用，且有 `skills-api.test.ts`），属**已接入但未提交**的进行中功能。
- **改动量**：148 文件，+11,860 / −2,286 行。

---

## 2. 类型健康评估（核心恶化项）

### 2.1 量化结果

| 检查 | 结果 |
|------|------|
| `tsc --noEmit -p server/tsconfig.json` | 🔴 **EXIT=2，1894 个错误 / 216 文件** |
| 错误文件归因：已提交代码（clean） | **162 文件** |
| 错误文件归因：工作区改动（M/??） | 54 文件 |
| 历史对照（07-20） | 9 错误 / 2 文件 |

### 2.2 错误集中区域（top）

| 文件 | 错误数 | 状态 |
|------|--------|------|
| `server/engine/plugins/gateway-startup-plugin-ids.ts` | 173 | — |
| `server/engine/plugins/runtime.ts` | 111 | — |
| `server/engine/infra/exec-approvals-allowlist.ts` | 99 | — |
| `server/engine/plugins/install.ts` | 87 | — |
| `server/engine/plugins/hooks.ts` | 74 | — |
| `server/engine/agents/thinking.ts` | 52 | — |
| `server/engine/agents/index.ts` | 45 | 引用不存在的导出（TS2305） |

### 2.3 错误类型特征

- **TS2339（属性不存在）**：`MessageSendContext` 无 `metadata`、`Map` 迭代器无 `map` —— 接口未对齐
- **TS2305（模块无导出成员）**：`handleCompactionEnd/Start`、`DEFAULT_EMBEDDED_AGENT_*` 等 —— 移植代码引用了尚不存在的符号
- **TS2345/TS2554**：参数类型不匹配 / 参数个数错误

**结论**：已提交的 HEAD 处于**严重类型不健康**状态。最近 commit 链（社交通道 + CLI 补全）在移植 openclaw 后**未跑 server 类型门禁就提交**，把大量"引用了不存在的导出"的半成品合入了主干。这推翻了前几次评估"已提交代码 tsc 0 错误"的前提。

---

## 3. 安全 P0 阻塞项对照

| # | 阻塞项 | 07-14 判定 | 07-22 现状 | 变化 |
|---|--------|-----------|-----------|------|
| 1 | 沙箱逃逸 | 🔴 | 🟡 有 sandbox commit（`cli + sandbox + zod-schema 解锁链`） | 局部 |
| 2 | 权限自声明 | 🔴 | 🔴 未解 | — |
| 3 | HTTP 无鉴权 | 🔴 | 🔴 chat 路由仍无 auth middleware（grep 命中 apiKey 均为 LLM Key，非路由鉴权） | — |
| 4 | HTTP 绑定 0.0.0.0 | 🔴 | 🔴 `server/index.ts:635` 仍 `server.listen(PORT, ...)` 无显式 host；`infra/ports.ts:32` 显式 `0.0.0.0` | — |
| 5 | 路径穿越 | 🔴 | 🟡 `path-guards` 已接入 `shell-env.ts`/`system-run-approval-binding.ts` | 局部 |
| 6 | 双层存储 | 🔴 | 🔴 未解 | — |
| 7 | 跨境能力 | 🔴 | 🔴 未解 | — |
| 8 | 回滚预案 | 🔴 | 🔴 未解 | — |
| 9 | WKWebView E2E | 🔴 | 🔴 未解 | — |
| 10 | ChatThread @keyframes | 🔴 | 🔴 未解 | — |
| 11 | ESM/require 残留 | 🟠 | 🟡 SSE 链路已清，其他残留 | 局部 |
| 12 | 类型健康（本期新增） | — | 🔴 **1894 错误 / 162 文件已提交代码** | 新增 |

---

## 4. 我们的工作回顾

| 工作项 | 状态 | 证据 |
|------|------|------|
| 五维软件分析 | ✅ 已交付 | 36 发现 / 15 行动项 |
| Debug 修复（SSE 漂移/脱敏/console→logger） | ✅ 已提交 | `git diff HEAD` 为空 |
| 架构重构（死函数删除/SSE 合并/sessionId+requestId） | ✅ 已提交 | 同上 |
| 验证门禁 | ✅ 当前绿 | `sseStreaming + chatService` 46/46 通过 |

> 注：我们的工作属代码健康改进，不在 P0 安全/发布阻塞清单内，未改变 No-Go 判定。

---

## ✅ 行动清单（按优先级）

| # | 行动 | 负责方 | 紧急度 | 期望完成 |
|---|------|--------|--------|---------|
| 1 | 修复 162 个已提交文件的类型错误，或回滚未过门禁的 commit 链，恢复 server tsc 0 错误 | 寇豆码 | P0 | 立即 |
| 2 | 在 CI 加 `tsc --noEmit -p server/tsconfig.json` 门禁，禁止类型不通过的 commit 合入 | 寇豆码 | P0 | 本周 |
| 3 | HTTP 监听显式绑 `127.0.0.1`（`server/index.ts:635` + `infra/ports.ts`） | 寇豆码 | P0 | 本周 |
| 4 | chat 路由加最小鉴权（本地 token / loopback 校验） | 寇豆码 | P0 | 本周 |
| 5 | 处置 318 工作区变更：skills 功能开发要么补类型+测试后提交，要么暂存 | 寇豆码 | P1 | 本周 |
| 6 | 将 `host-env-security`/`path-guards` 接入主干后的效果补测试，计为安全缓解证据 | 严过关 | P1 | 本周 |
| 7 | 建发布回滚预案（动态 minVersion + 保留近 3 版 DMG） | 寇豆码 | P1 | 下周 |

---

## ⚠️ 已知局限

- 类型错误归因中"已提交 162 文件"是基于当前工作区状态判定（工作区无改动即视为已提交代码）；未做 stash 后的纯净 HEAD 验证，但工作区只动 54 个错误文件，不影响"已提交代码本身有大量类型债"的结论。
- 安全缓解（sandbox/path-guards 接入）未做运行时验证，仅基于代码接入判定"局部改善"，实际防护效果需 QA 验证。
- 本评估未跑全量 448 测试文件（仅跑我们的 46 个），全量测试通过率未知。

---

> 本报告由软件工坊 AI 协作生成（降级执行模式），关键决策请由工程负责人复核。
