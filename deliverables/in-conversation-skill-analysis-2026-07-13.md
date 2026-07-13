# 对话内能力分析：openclaw vs cdf-know-clow

> 分析日期：2026-07-13
> 目标：回答用户四个问题
> 1. openclaw 在 AI 对话内如何生成文件
> 2. openclaw 如何在对话中自动识别 skill 能力
> 3. cdf 现有"假 skill"现状，如何真正内置化
> 4. 想在 cdf 对话中"制作 skill"，还缺什么没从 openclaw 移植

---

## 一、openclaw：对话内生成文件（file / artifact generation）

### 机制
openclaw 的"生成文件"不是单一功能，而是**技能 + 文件写回 + UI 附件渲染**三段式：

- **技能脚本写文件**：技能（如 `diagram-maker`、`nano-pdf`、`meme-maker`、`extensions/canvas`）在 `scripts/` 里跑确定性脚本，把产物写到工作区（workspace / 临时目录），返回文件路径。
- **对话消息支持文件附件**：openclaw 的对话消息模型带 `artifact` / `downloadUrl` / `attachments` 字段（`src/` 下 `music-generation`、`transcripts`、`clawhub` 等多处使用），UI 直接把路径渲染成可预览 / 可下载的卡片。
- **assets/ 约定**：技能目录约定包含 `assets/`（输出资源/模板），产物天然归到技能空间。

### 关键证据（openclaw 仓库）
- `src/skills/discovery/skill-index.ts`：技能名归一化 → 条目索引。
- `src/.../clawhub.ts`、`src/music-generation/provider-assets.ts`：artifacts / 下载资源回传。
- `skills/skill-creator/SKILL.md`：技能布局明确含 `assets/`、`scripts/`、`references/`、`agents/`。

### cdf 现状与缺口
- cdf 对话走 SSE 文本流（`text/thinking/tool_call/permission_request`），**没有"文件附件"消息类型**。
- cdf 工具（`file_write` / `exec_command`）能写本地文件，但**前端没有对话内文件预览/下载渲染层**——文件生成了用户看不到、点不了。
- **缺口 A**：缺 `artifact` 消息类型 + 前端文件卡片渲染。这是对话内生成文件能力的最大空白。

---

## 二、openclaw：对话中自动识别 skill 能力（auto-recognition）

### 机制
- `src/skills/discovery/` 是一整套**技能索引 + 过滤层**：
  - `skill-index.ts`：归一化技能名 → 加载条目。
  - `filter.ts` / `agent-filter.ts`：决定"哪些技能对当前 agent 可见/可自动注入"。
  - `bins.ts`：分组。
- 匹配到的技能**自动注入 system prompt**（无需用户 `@` 显式调用），LLM 在生成时即可感知并使用。

### cdf 现状（已双向具备，且更强）
cdf 不但在，而且比 openclaw 多一层：

- `server/engine/skillRouter.ts`（P2-1b 智能技能路由）：
  ```
  query + 对话上下文 → matchingService.match → top-N → 注入 <available_skills> 到 system prompt
  ```
- `getFolderSkillsForMatching()`（`skillRuntimeBridge.ts:235`）把 18 个 SKILL.md 文件夹技能聚合并强制 `status='active'`，使其进入匹配。
- 关键词模式永远兜底；仅当 ONNX 模型 `ready` 时叠加 context 语义增强（已随本次 ONNX 打包修复，首次不再下载阻塞）。
- 后端 `initSkillRuntime()` 已在 `toolRegistry.ts:940-941` **启动时调用** → 仓库 `skills/` 18 个技能**确已装入** skillRegistry（此前文档记录的"死区"已修复）。

### 结论
**自动识别核心能力已具备**，与 openclaw 等价甚至更强（advanced-triggers 语义/模糊/上下文/组合/AI 分类器）。差异仅在 openclaw 是 discovery 注入、cdf 是 `skill use <id>` 渐进式披露指令注入——二者都是让 LLM 自行决定调用，方向一致。

---

## 三、cdf 现有"假 skill"现状与内置化路径

### 现状（已实测 `skills/` 目录）
18 个技能，**100% 纯 prompt-only**（仅 `SKILL.md`，2 个含 `references/`，**零可执行 handler**）。靠 `skill use <id>` 把文档塞给 LLM，再靠 LLM 调 `exec_command` 执行外部二进制。

**"假"的根因 = 依赖未随包分发的外部 CLI：**

| 技能 | 外部依赖 | 发布版是否可用 |
|------|----------|----------------|
| `coding-agent` | `claude` / `codex` | ❌ 未打包 |
| `gh-issues` | `coding-agent`(claude/codex) | ❌ 连带失败 |
| `himalaya` | `himalaya`(邮件 CLI) | ❌ 未打包 |
| `nano-pdf` | `nano-pdf` | ❌ 未打包 |
| `summarize` / `message_summarizer` | `summarize` | ❌ 未打包 |
| `spotify` | `spotify` + `brew install` | ❌ 未打包 |
| `diagram-maker` | 纯 LLM+指令 | ✅ |
| `weather` / `web-search` / `notes` / `todo` | 纯 LLM+内置工具 | ✅ |
| `wms_daily_report` / `wms_inbound_create` / `wms_stock_query` / `data_analyzer` / `pdf_exporter` | 依赖内部 MCP/工具 | ⚠️ 视后端是否存在 |

→ **约 6 个技能是"假"的**（依赖外部 CLI），用户感知的"技能不可用"主要来源于此。

### 内置化三条路（建议组合）
- **路线 A（立即可做）**：删 / 降权外部 CLI 依赖型技能（spotify/himalaya/coding-agent/nano-pdf/summarize/gh-issues），保留真正 LLM+内置工具能完成的。
- **路线 B（能力内建）**：把外部能力内化——`nano-pdf` 改用本地 PDF 库、`coding-agent` 接 cdf 自带 agent、`spotify` 接 MCP。工作量大。
- **路线 C（业务真内置）**：把 wms_* / data_analyzer / pdf_exporter 从"声明式 SKILL.md"升级为**带 handler 的可执行 skill**（`skillToolBridge` 的 `skill_<id>` 路径），做到真正内置、可测、可控。

---

## 四、对话中"制作 skill"还缺什么（vs openclaw skill-creator）

### cdf **已经具备**对话内创作（被低估的能力）
- `skill_createProposal` 工具**已注册**（`toolRegistry.ts:603`），LLM 调用 → `handleSkillCreateProposal` → 写 `AppPaths.skillsDir/<name>/SKILL.md`。
- 后端 `skillWorkshop` 有完整生命周期：提案 → 安全扫描 quarantine → 应用 → 回滚。
- `/api/skill-workshop/quick-create` HTTP 端点存在。
- `skillWatcher`（chokidar）监听 `skillsDir/**/SKILL.md`，新增即热刷新；`initSkillRuntime` 启动扫描已含该目录 → 新技能重启/热刷新后即加载。

### 与 openclaw `skill-creator` 的差距（缺口）
| # | 缺口 | 说明 | 建议 |
|---|------|------|------|
| D1 | **缺 skill-creator 引导技能** | openclaw 用 `skills/skill-creator/SKILL.md` 引导 LLM 一步步产出规范 SKILL.md（含 schema 校验、references/scripts/assets 拆分、allowed-tools 写法）。cdf 只给裸工具，LLM 易产出缺 `description`、字段错的文档。 | 补 `skills/skill-creator/SKILL.md` 作引导模板 |
| D2 | **创建后未自动热刷新 reload** | `skillToolHandler` 有 `reload` action，但创作工具 `handleSkillCreateProposal` 应用后未自动调 `reloadSkills()`。 | autoApply 成功后追加 `await reloadSkills()` |
| D3 | **无前端创作状态反馈** | openclaw 有 UI / 斜杠命令；cdf 全靠 LLM 调工具，用户无"正在创建技能"可见反馈，也无"已创建/已生效"确认。 | 加 skill 创作 toast（复用 SkillLoadErrorListener 模式） |
| D4 | **无"可执行 skill"创作路径** | 当前只能产声明式 SKILL.md（prompt-only），对话中无法生成带 handler 的 `skill_<id>`。 | 非硬缺口（openclaw 也多为声明式），但"内置化"需要 |
| D5 | **schema 未对齐 openclaw** | openclaw frontmatter：`name`+`description` 必填，可选 `metadata`/`homepage`/`allowed-tools`/`user-invocable`/`license`，布局 SKILL.md+scripts/references/assets/agents。cdf 现有 18 个 SKILL.md 字段不统一、缺 `allowed-tools` 规范。 | 统一 frontmatter 契约 + 校验 |

### openclaw SKILL.md schema（移植参考）
```
必填: name, description
可选: metadata, homepage, allowed-tools, user-invocable, license
布局:
  skill-name/
    SKILL.md          # 精简；只放触发关键事实
    scripts/          # 确定性辅助脚本
    references/       # 按需加载的文档
    assets/           # 输出资源/模板
    agents/           # UI 元数据
规则: frontmatter description 用名词短语、短触发词；长示例/文档移到 references/；编辑后校验 YAML。
```

---

## 五、行动建议（按性价比排序）

1. **立即可做（零代码/低风险）**：删 / 降权 6 个外部 CLI 依赖型假技能（路线 A），消除"技能不可用"主因。
2. **小改（D2）**：`handleSkillCreateProposal` autoApply 后自动 `reloadSkills()`，让对话内创作的技能立即生效。
3. **中改（D1+D5）**：补 `skills/skill-creator/SKILL.md` 引导模板 + 统一 18 个 SKILL.md 的 frontmatter 契约。
4. **前端（D3）**：加 skill 创作 / 生效状态 toast。
5. **大改（缺口 A）**：补 `artifact` 消息类型 + 前端文件卡片，才能真正"对话内生成文件/预览下载"。
6. **路线 C（业务内置）**：wms_* 等升级为带 handler 的可执行 skill。

---

## 附：已验证事实清单
- `initSkillRuntime()` 在 `toolRegistry.ts:940-941` 启动时调用 → `skills/` 18 个技能确已装入。
- `skill_createProposal` 工具 `toolRegistry.ts:603` 已注册。
- `getFolderSkillsForMatching()` 强制 folder-skill `status='active'` 进入匹配（`skillRuntimeBridge.ts:272`）。
- `skillRouter` 注入 `<available_skills>` 到 system prompt（`skillRouter.ts:7-9`）。
- openclaw `skill-creator` 是引导型 SKILL.md（`openclaw/skills/skill-creator/SKILL.md`）。
- openclaw discovery 层：`skill-index.ts` / `filter.ts` / `agent-filter.ts` / `bins.ts`。
