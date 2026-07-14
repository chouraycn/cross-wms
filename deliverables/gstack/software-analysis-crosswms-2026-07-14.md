# CrossWMS 全维度软件分析报告

**日期**：2026-07-14
**场景**：软件分析（产品/架构评审 + 安全审计 + QA/发布评审 + 设计系统审查 + 代码健康诊断）
**参与成员**：产品官（产品评审） + 安全卫士（OWASP+STRIDE 审计） + 质量门神（QA测试与发布） + 设计师（设计系统与视觉） + 排障手（代码健康诊断）

---

## 📌 TL;DR（执行摘要）

- **整体结论：🔴 不通过（可修复，非架构死局）**——存在多处 P0 级安全漏洞、无发布回滚预案、跨境核心能力未落地，当前形态不适合对外正式发布/承诺。
- **阻塞项数量：10 项 🔴 严重** + 2 项 🟠 高危（详见第 2 节）。
- **亮点**：流式优先架构与 Auto Model v2.0 路由扎实、工程 DX（TS strict / knip / WKWebView-lint）到位、核心 SSE 与 tool_calls 防御链健壮、设计 token 地基良好。
- **最紧急三件事**：① 堵死插件沙箱逃逸 + 落地权限拦截（安全）；② 本地 HTTP 绑定 127.0.0.1 并全 /api 加鉴权（安全）；③ 补发布回滚预案（QA）。
- **下一步**：按第 3 节行动清单 P0 项逐条修复，安全严重项清零后再评估 Go。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| Go / No-Go | 🔴 No-Go（须先清零 P0 安全/数据/发布项） |
| 严重度分布 | 🔴 10 / 🟠 2 / 🟡 19 / 🟢 12 |
| 关键行动项 | 15 条（P0 × 7，P1 × 8） |
| 建议负责人 | 安全卫士（P0 安全）+ 排障手（ESM/存储/SSE）+ 质量门神（回滚/E2E）+ 产品官（命名/跨境定位）+ 设计师（WKWebView 动效） |

---

## 1. 各成员核心结论

### 🔍 产品官（产品评审）
- **核心判断**：CrossWMS 实为 OpenClaw 通用 Agent 框架的硬 fork + 跨境 WMS 壳层桌面应用；流式架构与 Auto Model 路由扎实，但存在「双层存储一致性风险、命名/文档漂移、引擎过度庞大」三患，且产品身份含糊（CrossWMS / CDF Know Clow / cdf-know-clow 三重命名），**跨境高价值能力（多渠道支付、双海关申报、价格口径一致性）当前均以规划态/LLM 泛化覆盖，无结构化业务模块落地**。
- **关键建议**：① 归一存储真相源（SQLite 或 JSON 其一，留 JSON 须加原子 rename + 文件锁，禁止一致性敏感数据进非事务 JSON）；② 改名双 TimerManager、对齐文档（策略数/事件数/构建脚本名）、定一个产品名；③ lint 对 @keyframes 改为硬阻断并替换 11 处 keyframes/rAF；④ 引擎「用到的才保留」，gate 掉未用子系统降维护面；⑤ fork 治理补「安全上游修复季度 port 复审」。

### 🛡️ 安全卫士（OWASP+STRIDE 审计）
- **核心判断**：权限三级与沙箱隔离多为**框架性空壳**——插件 VM 沙箱可被 `Object.constructor('return process')()` 逃逸（node:vm 官方声明非安全边界）、权限管线 9 层 handler 全 `()=>undefined` 落到默认 allow-all、本地 HTTP 控制面无鉴权且绑定 0.0.0.0；恶意插件或同机/局域网进程可取得近似宿主级控制能力。
- **关键建议**：① 插件沙箱改独立子进程 + 系统级隔离，或禁止插件动态代码执行；② 生产注册真实策略层、默认拒绝（修 toolPolicyPipeline 空壳）；③ 本地 HTTP 绑定 127.0.0.1、全 /api 加 token/同源校验、secrets 强制鉴权；④ WMS 路径穿越防护（collection 白名单 + 限制落于 WMS_DATA_DIR）；⑤ 插件提权需用户显式授予，禁止 manifest 自声明 high-risk。

### ✅ 质量门神（QA测试与发布）
- **核心判断**：质量门禁（pr-quality-gate 串联 lint/双 tsc/knip/WKWebView-lint/覆盖率/安全审计）与测试分层（unit/integration/UI E2E）扎实；但**发布回滚缺位、WKWebView 无 E2E 覆盖、DMG 背景竞态仍存**，整体 **Go（带条件），建议 No-Go 直到补齐回滚预案与 DMG 验证**。另确认项目实为 **CDF Know Clow**（Swift/WKWebView 原生桌面 + Express），非背景资料所述的 PyWebView。
- **关键建议**：① 补发布回滚（release.json 动态 minVersion=上一稳定版、保留近 3 版 DMG artifact、文档化坏版处理）；② DMG 背景 `wait_for_dsstore_flush` 超时改为 fail 或 CI 校验 .DS_Store；③ 补 WKWebView E2E（macos runner playwright/webkit 冒烟覆盖 SSE 流与 @keyframes 禁用）；④ 前端 `useAgentChat` 加 60s 心跳看门狗超时主动结束「思考中」；⑤ 提升覆盖率阈值、knip 改可配置阻断。

### 🎨 设计师（设计系统与视觉）
- **核心判断**：`theme.ts` token 体系基础扎实（支持 accent/borderRadius/fontSize 多档、语义色含 WCAG AA），但落地「双轨制」——大量组件绕过 token 硬编码颜色/圆角/阴影，`index.css` 手工 dark 兜底说明部分面板未接入主题；frameless 窗口控件（红黄绿按钮 12px、无标签、green 按钮语义错乱）可发现性弱；**ChatThread 历史切换动画仍用 @keyframes，违反 WKWebView 约定会静默失效**。
- **关键建议**：① ChatThread 的 tearOpen 改 JS + transition（同 PulsingText 范式）并补 WKWebView 兼容断言；② 全量 borderRadius/阴影/边框路由到 theme token，清理 index.css 手工兜底；③ WindowDragBar 加常驻图标/浅色底条，修正 green 按钮语义（最大化→还原）；④ 统一 Tailwind primary 与 MUI accent，或弃用 Tailwind 避免双轨；⑤ 高密度 WMS 表格页（Inventory/Transfer/WmsOutbound）做密度与可读性走查。

### 🔧 排障手（代码健康诊断）
- **核心判断**：核心 SSE 与 tool_calls 防御链健壮（sseTypes/sseHelper 全 `!res.writableEnded` 防护、chatService 所有 catch 走 sendDoneAndEnd、tool_calls 三层防御已落地）；**主要风险集中在 ESM/require 历史债务、日志规范未全面落实、SSE 双实现分裂、构建原生模块脆弱点**——其中 ESM/require 残留是 dev/prod 不一致的根因（server_dist 为 ESM 构建，require() 会 ReferenceError）。
- **关键建议**：① 清理 engine 文档/PDF/图片工具的 require() 残留统一 import/import()；② 收敛 SSE 到单一实现（sseTypes.ts 为主，sseHelper.ts 改适配层或删除）；③ 替换 channels/outbound 与 observer 的裸 console.* 为 logger；④ 构建管线增加原生模块预编译冒烟测试（多架构/Node 版本）。

---

## 2. 综合审查发现（去重合并后按严重度排序）

> 安全维度采用「STRIDE 威胁建模 + OWASP Top 10 检查表」框架；跨维度重复项已合并。

| # | 严重度 | 类别 | 位置 | 问题描述 | 建议 | 来源成员 |
|---|--------|------|------|---------|------|---------|
| 1 | 🔴 | 安全 | server/engine/pluginSandbox.ts:14,64-76,178-244 | 插件 VM 沙箱逃逸：注入宿主真实构造器，`Object.constructor('return process')()` 可逃逸 node:vm（非安全边界），detectDangerousCode 仅拦字面 eval | 改独立子进程 + 系统级隔离，或禁止插件动态代码执行 | 安全卫士 |
| 2 | 🔴 | 安全 | engine/pluginRegistry.ts:501-538 | 插件权限自声明：high-risk 仅需 manifest 自声明，无审核/用户确认 | 提权需用户显式授予与安装审查，禁止自我声明 | 安全卫士 |
| 3 | 🔴 | 安全 | server/index.ts:555 + routes/secretsService.ts | 本地 HTTP 无鉴权 + 绑定 0.0.0.0；/api/*（含 secrets/插件/bash/文件）无 auth，CORS 允许 file:// 带凭据 | 绑定 127.0.0.1，全 /api 加 token/同源校验，secrets 强制鉴权 | 安全卫士 |
| 4 | 🔴 | 安全 | storage/WmsFileStorage.ts:22-24,44-48 | WMS 文件存储路径穿越：collection 未校验直接 path.join，../../ 可越目录读写 | 白名单校验 collection，解析后限制落于 WMS_DATA_DIR | 安全卫士 |
| 5 | 🔴 | 数据 | server/storage/WmsFileStorage.ts + db-wms.ts | 双层存储一致性风险：JSON 整文件同步写（无原子 rename/事务/锁）与 SQLite 并存，直接威胁「价格口径一致性」 | 归一真相源；留 JSON 须原子 rename + 文件锁 | 产品官 + 排障手 |
| 6 | 🔴 | 产品 | server/db-wms.ts / src / skills/ | 跨境高价值能力未落地：多渠道支付/双海关申报/价格口径一致性无结构化业务模块（仅 LLM 泛化 + 关键词路由 + SKILL.md 文本），属需求-实现偏差 | 如实标注规划态，或补海关申报工作流 + 支付 + 价格口径数据模型 | 产品官 |
| 7 | 🔴 | 发布 | release.json + .github/workflows | 无发布回滚预案：minVersion 写死 "1.0.0"，Release 不可变无降级脚本 | 动态 minVersion=上一稳定版 + 保留近 3 版 DMG artifact | 质量门神 |
| 8 | 🔴 | QA | e2e/ 仅 chromium + ubuntu dev server | WKWebView 缺 E2E：Swift/WKWebView 原生壳渲染路径无自动化覆盖，仅靠静态 lint | macos runner 跑 playwright/webkit 冒烟覆盖 SSE 流与 @keyframes | 质量门神 |
| 9 | 🔴 | 设计 | src/components/CDFChat/ChatThread.tsx | 仍用 index.css @keyframes tearOpen（违反 WKWebView 不用 @keyframes 约定），静默失效 | 改 JS + transition，补 WKWebView 兼容断言 | 设计师 |
| 10 | 🔴 | 代码 | server/engine/{pdfProcessor,documentTools,imageTools,pdfTools}.ts 等 | ESM/require 残留：dev 靠 tsx shim 可跑，server_dist 为 ESM 构建运行时 ReferenceError（dev/prod 不一致根因） | 统一迁移 import/import() | 排障手 |
| 11 | 🟠 | 安全 | engine/toolPolicyPipeline.ts:82-91 | 权限管线是空壳：9 层 handler 全 `()=>undefined`，生产从未注册，check() 落默认 allow-all | 生产注册真实策略层，默认拒绝 | 安全卫士 |
| 12 | 🟠 | 安全 | engine/sandboxPolicy.ts:88-89,259 | 沙箱命令策略可绕过：medium 放行 node/python3 可 `-c` 执行任意代码，注入检测不拦反引号/$() | 禁止直接放行通用解释器，改参数级策略 | 安全卫士 |
| 13 | 🟡 | 安全 | server/modelsStore.ts:52-54,399-413 | 密钥明文缓存 30s + 内存回退（EPERM 走内存） | 缩短 TTL、加密缓存、限制敏感接口 | 安全卫士 |
| 14 | 🟡 | 安全 | storage/WmsFileStorage.ts:31-41 | WMS 同步读 + JSON.parse 无大小限制，大文件/畸形 JSON 可 DoS，错误静默转空 | 限大小、失败告警 | 安全卫士 |
| 15 | 🟡 | 安全 | storage/*.json 默认权限 | JSON 数据文件无 chmod 600，同机多用户可读敏感数据 | 创建时设 0600 | 安全卫士 |
| 16 | 🟡 | 安全 | aiClient.ts + toolExecutor.ts:195 | Prompt 注入：MCP/插件/技能结果回流 LLM 无隔离标记 | 工具结果边界标注、敏感操作二次确认 | 安全卫士 |
| 17 | 🟡 | 产品 | server/sse/timerManager.ts vs server/core/timerManager.ts | 同名双 TimerManager 职责不同却同名且都在用，易误用 | 改名 HeartbeatManager / BackgroundScheduler | 产品官 |
| 18 | 🟡 | 产品 | README/docs 漂移 | 「4策略」实为 LEGACY/REACT/AGENT/AUTO；「SSE 8 种」实为 28 种；构建脚本名不符 | 对齐文档与代码 | 产品官 |
| 19 | 🟡 | 产品 | src 11 处 @keyframes + SpinningIcon.tsx rAF | WKWebView 硬约束未守，lint 把 keyframes 降为 warning | lint 改硬阻断并替换 | 产品官 |
| 20 | 🟡 | 产品 | server/engine 220 文件 / ~75 万行 TS | 引擎过度庞大，Multi-Agent/子代理等大量冗余 | 「用到的才保留」gate 未用子系统 | 产品官 |
| 21 | 🟡 | QA | scripts/create-dmg.sh:173-174 | DMG 背景竞态：`wait_for_dsstore_flush` 超时仅 warn，慢 CI 仍可能丢背景 | 超时改 fail 或 CI 校验 .DS_Store | 质量门神 |
| 22 | 🟡 | QA | src/hooks/useAgentChat.ts:1112 | SSE 前端无显式 60s 心跳看门狗，断流可能卡更久 | 超时主动结束「思考中」并报错 | 质量门神 |
| 23 | 🟡 | QA | server/modelsStore.ts:54,399-412 | 模型加载 Keychain 缓存 30s，配置变更最长 30s 才生效 | 评估缩短或显式失效 | 质量门神 |
| 24 | 🟡 | QA | .github/workflows 安全审计 | 仅 npm audit --audit-level=critical，snyk `|| true`，knip continue-on-error | 提升审计门槛 | 质量门神 |
| 25 | 🟡 | 设计 | src/components/Layout/WindowDragBar.tsx | 红黄绿按钮 12px、无标签/无背景条、green 按钮最大化↔全屏语义错乱 | 加常驻图标/浅色底条，修正语义 | 设计师 |
| 26 | 🟡 | 设计 | TransferPage/SkillDetailPage/WmsQualityPage 等 | 跨组件硬编码颜色/圆角/阴影绕过 theme token | 全量路由到 token | 设计师 |
| 27 | 🟡 | 设计 | src/index.css 手工 dark 兜底 | 部分面板未接入主题 token | 清理手工兜底 | 设计师 |
| 28 | 🟡 | 设计 | tailwind.config.js vs theme.ts | Tailwind primary=#1a237e 与 MUI ACCENT 不一致，双体系漂移 | 统一或弃用 Tailwind | 设计师 |
| 29 | 🟡 | 代码 | server/channels/outbound/* + engine/observer.ts:274 | 日志规范未落实：仍用 console.error/warn（logger.ts 要求禁裸 console.*） | 替换为 logger | 排障手 |
| 30 | 🟡 | 代码 | sseTypes.ts vs routes/chatHelpers/sseHelper.ts | SSE 双实现分裂，两套 activeSSEConnections 并存易漂移 | 收敛为单一通道 | 排障手 |
| 31 | 🟡 | 代码 | scripts/{pre-build-check,package-mac-app}.sh | 构建依赖脆弱：better-sqlite3/onnxruntime-node/fsevents prebuild 不匹配会被 SIGKILL | 加原生模块冒烟测试 | 排障手 |
| 32 | 🟢 | 产品 | streamExecutor.ts / modelSelector.ts | 流式优先架构优、Auto Model v2.0 真实落地（5维加权+4层分流，透明度好） | 保留 | 产品官 |
| 33 | 🟢 | 安全 | server/index.ts:33-38 | 全局异常不退出（可能掩盖 RCE 痕迹，关键路径建议 fail-fast） | 关键路径 fail-fast | 安全卫士 |
| 34 | 🟢 | QA | pr-quality-gate.yml / e2e/ | 质量门禁强、测试分层完整 | 保留并强化 | 质量门神 |
| 35 | 🟢 | 设计 | usePageFadeIn/ThinkingBlock/SpinningIcon/PulsingText | 已按 WKWebView 约定用 setTimeout(16)+transition，方向正确 | 推广为范式 | 设计师 |
| 36 | 🟢 | 代码 | sseTypes.ts / chatService.ts / contextTruncate.ts | SSE 健壮性到位、tool_calls 三层防御已落地、上下文压缩已落地 | 保留 | 排障手 |

---

## ✅ 行动清单（15 条，至少 3 条）

| # | 行动 | 负责方 | 紧急度 | 期望完成 |
|---|------|--------|--------|---------|
| 1 | 插件 VM 沙箱改独立子进程隔离，或禁止插件动态代码执行（`Object.constructor` 逃逸路径） | 安全卫士 + 排障手 | P0 | 2 周内 |
| 2 | 本地 HTTP 绑定 127.0.0.1，全 /api 加 token/同源校验，secrets 强制鉴权 | 安全卫士 | P0 | 1 周内 |
| 3 | 权限管线 toolPolicyPipeline 注册真实策略层、默认拒绝（修 9 层空壳 handler） | 安全卫士 | P0 | 1 周内 |
| 4 | WMS 文件存储路径穿越防护：collection 白名单 + 限制落于 WMS_DATA_DIR | 安全卫士 + 排障手 | P0 | 1 周内 |
| 5 | 补发布回滚预案：release.json 动态 minVersion + 保留近 3 版 DMG artifact + 文档化坏版处理 | 质量门神 | P0 | 1 周内 |
| 6 | 归一存储真相源（SQLite 或 JSON 其一；留 JSON 须原子 rename + 文件锁） | 产品官 + 排障手 | P0 | 3 周内 |
| 7 | 清理 engine 文档/PDF/图片工具 require() 残留，统一 import/import()（dev/prod 一致） | 排障手 | P0 | 2 周内 |
| 8 | 跨境能力落地或如实标注为规划态（海关申报工作流 + 多渠道支付 + 价格口径数据模型） | 产品官 | P1 | 下个里程碑 |
| 9 | ChatThread @keyframes 改 JS+transition，补 WKWebView 兼容测试断言 | 设计师 + 排障手 | P1 | 1 周内 |
| 10 | 补 WKWebView E2E（macos runner playwright/webkit 冒烟覆盖 SSE 流与 @keyframes 禁用） | 质量门神 | P1 | 2 周内 |
| 11 | 前端 `useAgentChat` 加 60s 心跳看门狗，超时主动结束「思考中」 | 质量门神 | P1 | 1 周内 |
| 12 | 收敛 SSE 双实现（sseTypes.ts 为主，sseHelper.ts 改适配层或删除） | 排障手 | P1 | 2 周内 |
| 13 | 命名/文档对齐（双 TimerManager 改名、策略数/事件数/构建脚本名）+ 定一个产品名 | 产品官 | P1 | 1 周内 |
| 14 | 全量 borderRadius/阴影/边框路由到 theme token，清理 index.css 手工 dark 兜底；WindowDragBar 加常驻图标并修正 green 语义 | 设计师 | P1 | 2 周内 |
| 15 | 替换 channels/outbound 与 observer 裸 console.* 为 logger；构建管线加原生模块预编译冒烟测试 | 排障手 | P1 | 2 周内 |

---

## ⚠️ 待完善 / 已知局限

- **项目身份澄清**：背景资料称「PyWebView 桌面应用」，但代码与 CI 实际为 **CDF Know Clow**（Swift/WKWebView 原生壳 + Express），build-dmg-pywebview.sh 不存在（实为 package-mac-dist.sh / create-dmg.sh）。本报告以代码实况为准。
- **需求-实现偏差**：跨境三大高价值能力（支付/双海关/价格口径）当前为规划态，对外讲述需避免与实现脱节。
- **安全审计范围**：本快照未发现 pywebview_app.py，威胁面以「本地 HTTP + 插件/MCP」为主；若后续引入原生壳桥接，需补充 pywebview 桥接越权专项审计。
- **探索深度**：各维度由 Explore 子 agent 基于代码静态探索得出，未运行动态渗透/载荷验证；P0 安全项建议落地前做实测确认。

---

## 📚 成员产出索引

- 产品官（产品评审）原始产出：Explore-1（产品/架构探索）+ product-reviewer 补遗（跨境能力未落地取证，含 db-wms.ts 实体清单、grep 证据）
- 安全卫士（OWASP+STRIDE 审计）原始产出：Explore-2（STRIDE + OWASP Top 10，11 条发现含 pluginSandbox/toolPolicyPipeline/WmsFileStorage/index.ts 行号）
- 质量门神（QA测试与发布）原始产出：Explore-3（QA/发布评审，含 pr-quality-gate.yml、create-dmg.sh、useAgentChat.ts 证据）
- 设计师（设计系统与视觉）原始产出：Explore-4（设计维度，含 ChatThread.tsx/WindowDragBar.tsx/theme.ts 证据）
- 排障手（代码健康诊断）原始产出：Explore-5（代码健康，含 SSE/tool_calls 防御链、require 残留清单、构建脆弱点）

---

> 本报告由软件工坊 AI 协作生成，关键决策请由工程负责人复核。
