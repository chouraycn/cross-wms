# CrossWMS 现状问题分析报告

> 分析时间：2026-07-13 23:40
> 分析者：Senior Developer（高级开发工程师）
> 当前代码版本：v1.7.87（git HEAD `72c9f118`）
> 范围：构建/编译 · 运行/测试 · 性能/体验，并对照今日 `runtime-issues-diagnosis.md` 已诊断结论

---

## 0. 一句话结论

代码**类型与单测整体健康**（`tsc --noEmit` 通过，新增模块 17/17 通过），今日诊断的用户反馈 4 项根因**已全部在代码层闭环**（R1/R2/R3 已修，R4 也已修）。真正"现在"还存在的问题是 **3 类**：

1. ~~R4 启动引导静默失败~~ → **已订正/已修复**：启动路径 `initFromApi` 本就 dispatch 可见事件 + `App.tsx` 监听弹 toast；原报告误判"启动缺口"，实际唯一静默的是手动刷新 `refreshFromRemote`，已改为可见（见 §1、§5 执行记录）。
2. **工作区 404 行未提交 WIP**（技能产出文件实时回写 T1–T4），且**无 e2e 覆盖**。
3. **版本/发布元数据混乱**：`version.txt`、`CHANGELOG.md`、磁盘 DMG 全部滞后实际代码约 2 个月。

> ⚠️ **元发现（两处过时）**：
> 1. 今日 `runtime-issues-diagnosis.md` 写于第 6 轮修复**之前**，其 R3/R4"未修复"状态已**过时**（R3 实际已修）。
> 2. **本报告初版也一度误判 R4**：把 `refreshFromRemote`（手动/SSE 刷新路径）误当成"启动引导"沉默根因。实测 `main.tsx:52` 启动走的是 `initFromApi`，其 catch 已 `dispatchEvent` 且 `App.tsx:613` 有专门监听弹 `技能加载失败` toast——**启动加载失败本就可见**。R4 实际只差"手动刷新静默"这一处，现已闭环（见 §5 执行记录）。

---

## 1. 对照今日诊断：已修复 vs 未修复（代码核查版）

| 今日诊断根因 | 实际状态 | 代码证据 |
|---|---|---|
| **R1 数据目录分裂**（含空格/无空格/旧目录） | ✅ **已修** | `appIdentity.ts:3` `DEFAULT_APP_NAME='CDFKnowClow'`；`appPaths.ts` `mergeDirectory()` 启动合并旧目录；第 7 轮已将含空格旧目录 `CDF Know Clow` 移入 `~/.Trash/`，无残留 |
| **R2 密钥/索引不匹配** | ✅ **已修** | 目录收敛到同一 `CDFKnowClow`，密钥/向量索引不再分裂 |
| **R3 embedText 无超时**（首启 ONNX 挂起→白屏） | ✅ **已修** | `onnxEmbedding.ts:509` `EMBED_TIMEOUT_MS=5000` + `:512 fallbackEmbedding` + `:528 withEmbedTimeout` + `:549 embedText` 包超时降级；且 `embeddingService.ts:376` `initOnnxEmbedding()` 外层 `try/catch` 失败即降级 Mock。**（初版报告误判为未修，已订正）** |
| **R4 技能加载静默失败**（"技能暂不可用"无提示） | ✅ **已修** | 启动路径 `initFromApi`（`main.tsx:52` 调用）的 catch 早已 `dispatchEvent('cdf-know-clow-api-error',{action:'initFromApi'})`（skillStore.ts:328-331），且 `App.tsx:613-627` 的 `SkillLoadErrorListener` 专门监听并弹 `技能加载失败：…` toast → 启动失败本就可见。唯一残留的静默 catch 是手动/SSE 刷新路径 `refreshFromRemote()`（skillStore.ts:116/126），**本次已改为与其它写操作一致**：失败 `dispatchEvent({action:'refreshFromRemote'})` + 置 `skillLoadError`，并扩展 `App.tsx` 监听接住该 action 弹 `技能刷新失败：…` toast。测试 `skillStore.test.ts` 新增断言锁定（36/36 通过）。 |

→ 结论：4 项用户反馈中，R1/R2/R3 已修，**R4 也已闭环**（启动路径本就可见，手动刷新静默处本次补齐）。本报告初版对 R4 的"启动缺口未堵"判断为误判，特此订正。

---

## 2. 当前工作区 WIP 风险（404 行未提交）

工作区 dirty（20 个文件），核心是第 10 轮分析的 **"技能/工具产出文件实时回写"** 功能（T1–T4）：

- 新增 `server/engine/generatedFileAttachment.ts`（提取工具结果的生成文件、emit SSE `file` 事件）
- `server/routes/agentChat.ts` / `server/sse/sseTypes.ts` 新增 `file` SSE 事件透传
- `src/hooks/useAgentChat.ts` 新增 `file` 事件处理（追加到 assistant 消息 `generatedFiles`）
- `server/engine/runChatSession.ts` 挂载文件提取钩子

**风险评估：**

| 项 | 状态 |
|---|---|
| 类型检查 | ✅ `tsc --noEmit` 全量通过 |
| 单测 | ✅ `generatedFileAttachment.test.ts` 17/17 通过 |
| e2e 覆盖 | ✅ **`file` SSE 事件 e2e 已补**（2026-07-13 23:52 新增 `e2e/api/agent-chat-file-event.test.ts`，2/2 通过；`file-generation.test.ts` 原只覆盖旧 `file_generateFile`→`tool` 路径，新事件透传此前为零覆盖） |
| 端到端链路 | ⚠️ 仅单测 + 部分 diff 验证，未跑真实会话回归 |
| 发布状态 | ⚠️ 全套改动**未提交、未进 release**，属"半成品集成"态 |

---

## 3. 版本 / 发布元数据混乱（发布流程缺陷 · 真问题）

| 来源 | 值 | 问题 |
|---|---|---|
| `version.txt` | `1.7.3` | ❌ 滞后于 `package.json` 的 1.7.87 |
| `package.json` | `1.7.87` | 实际代码版本 |
| `git describe` | `v1.7.81-13-g72c9f118` | HEAD 超前最近 tag 13 个提交 |
| `CHANGELOG.md` 顶部 | `## v1.5.184 (2026-06-20)` | ❌ **完全缺失整个 v1.7.x 线**（约 2 个月、80+ 版本） |
| `build.log` / `build-pywebview/dist/*.dmg` | v1.5.161（2026-06-19） | ❌ 磁盘上的可分发产物**不是现在的代码** |

→ 用户现在能拿到/运行的 DMG 是 6/19 的旧包；今天写的代码、改的 bug 全在磁盘源码里，没进任何分发物。

---

## 4. 构建 / 性能告警（来自 build.log，预计复现）

1. **动态/静态 import 冲突 → 代码分割失效**
   `src/App.tsx` 用 `import()` 懒加载 20+ 页面，但 `ToolManagementDialog` 又**静态 import** 了其中多个 → esbuild 报 "dynamic import will not move module into another chunk"。结果：`main-Btv8CiIS.js` 仍 **665KB（gzip 190KB）** 被整体加载，懒加载形同虚设。
   *修复方向*：要么让 `ToolManagementDialog` 改为动态 import 这些页面，要么放弃对这些页面的懒加载（二选一，不能又要静态又要分割）。

2. **server CJS 构建 `import.meta` 告警**（非致命）
   `server/routes/chat.ts:11` `createRequire(import.meta.url)` 在 CJS 输出格式下 `import.meta` 为空，靠构建期 patch 兜底（用 `__filename`）。属格式错配，建议把该文件输出格式改为 ESM 或改用 `createRequire(require('url').pathToFileURL(__filename))`。

---

## 5. 建议行动优先级（给 QA / 发布的 action）

### P0 — 必须现在做
- [x] **堵 R4 静默 catch（已执行 · 2026-07-13 23:45）**：实测启动走 `initFromApi` 本就可见，故改为补**手动刷新** `refreshFromRemote()` 的静默 catch——`skillStore.ts:126` 加 `dispatchEvent({action:'refreshFromRemote'})` + 置 `skillLoadError`；`App.tsx:619` 监听扩展到该 action 弹 `技能刷新失败：…` toast。`skillStore.test.ts` 新增 1 条断言（36/36 通过），`tsc --noEmit` 0 错。**注：原"启动缺口"为误判，实际启动路径早已可见**。
- [x] **补 `file` 事件 e2e（已执行 · 2026-07-13 23:52）**：新增 `e2e/api/agent-chat-file-event.test.ts`，挂载真实 `agentChat` 路由（`vi.mock` 替掉 `runChatSession` 经 `onEvent` 发 `file` 事件），断言 SSE 线 `stream='file'` 且 `fileId/fileName/source/skillId/downloadUrl/fileSize` 完整透传；反向用例确认 `file` 分支独立、不污染常规流。**2/2 通过**。`file-generation.test.ts` 原只覆盖旧 `file_generateFile`→`tool` 路径，新事件透传此前为零覆盖。
- [ ] **重 build 一份 v1.7.87 DMG** 替换 6/19 旧包；同步 `version.txt` 与 `CHANGELOG.md`（补齐 v1.7.x 线）。

### P1 — 尽快
- [ ] 解决动态/静态 import 冲突（见 §4.1），真正拿到代码分割收益（主包 665KB 可显著瘦身）。
- [ ] 回写 `runtime-issues-diagnosis.md` 状态（R1/R2/R3 已修、R4 部分修），避免重复排期。

### P2 — 流程加固
- [ ] CI 加门禁：`tsc --noEmit` + `vitest run` + `git describe` 与 `version.txt` 一致性校验，防止元数据再次漂移。

---

## 6. 当前健康度快照

| 检查项 | 结果 |
|---|---|
| `tsc --noEmit`（web + server） | ✅ 通过 |
| 新增模块单测 `generatedFileAttachment` | ✅ 17/17 |
| 历史 e2e 结果（`e2e-results.json`） | ⚠️ 127/127 通过，但**未覆盖当前 WIP**，且非本次运行 |
| 全量 `vitest run` | ⏳ 运行中（结果见附录/后续通知） |
| 构建产物时效 | ❌ DMG 滞后 2 个月 |
| 版本元数据一致 | ❌ version.txt / CHANGELOG / 磁盘包三者不一致 |
| 用户反馈 4 项根因 | ✅ R1/R2/R3/R4 均已修（R4 启动路径本就可见，手动刷新静默处已补） |
