---
name: skill-creator
description: 在对话中创建、编辑、审核或重构技能（SKILL.md）。当用户想把某类任务固化为可复用技能、或新增/修改一个能力时使用。
version: 0.1.0
metadata:
  crosswms:
    category: general
    executionMode: agent
    source: workspace
    status: active
---

# Skill Creator（技能创建引导）

引导 AI 在对话中把一个能力沉淀为规范、可热加载的技能。

## 何时使用
- 用户说"做个技能 / 把 XX 固化成技能 / 新增一个 XX 能力"。
- 用户想把某类重复任务变成可复用技能。

## 工作流
1. **确认意图与名称**：技能名用短横线小写（如 `pdf_summarizer`），避免空格与中文。
2. **写 SKILL.md**：先用 `skill_createProposal`（参数 `autoApply: true`）写入
   `<dataDir>/skills/<name>/SKILL.md`。frontmatter 必须含 `name` + `description`。
3. **frontmatter 契约**（对齐 cdf 真实工具名）：
   - 必填：`name`（短横线小写）、`description`（名词短语、短触发词、带引号）。
   - 可选：`version`、`triggers`（`intent:` / `keyword:` / `schedule:`）、`allowed-tools`。
   - `allowed-tools` **只能用 cdf 真实工具名**，例如：
     `file_readFile` / `file_writeFile` / `file_generateFile` / `file_updateGeneratedFile` /
     `file_listDir` / `shell_exec` / `web_search` / `web_fetch` / `wms_inventory` /
     `skill_createProposal`。
   - 布局可选：`scripts/`（确定性脚本）、`references/`（长文档按需加载）、`assets/`（模板/资源）。
4. **长内容外置**：示例、文档、脚本移到 `references/` 与 `scripts/`，SKILL.md 保持精简。
5. **校验**：写完用 `skill` 元工具 `action=use` 回读确认；确认 YAML frontmatter 合法。

## 规则
- `description` 用名词短语，不要写完整工作流。
- 不要编造不存在的工具名（见上方允许列表）。
- 创建后技能会自动热刷新（`reloadSkills`），无需重启即可被匹配路由命中。
- 技能是"声明式指令文档"：LLM 读取后用 `allowed-tools` 里的真实工具完成任务。
