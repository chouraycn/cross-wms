# 已归档技能（.archived）

本目录下的技能**不再被加载**（扫描器 `skillLoader` 跳过以 `.` 开头的目录）。

## 归档原因
这些技能是"假技能"——其 SKILL.md 仅描述用外部 CLI 完成任务，但对应 CLI **未随应用分发**，
在发布版中调用必然失败，导致用户感知"技能不可用"。

| 技能 | 缺失的外部依赖 |
|------|----------------|
| `coding-agent` | `claude` / `codex` |
| `gh-issues` | `coding-agent`（claude/codex） |
| `himalaya` | `himalaya`（邮件 CLI） |
| `nano-pdf` | `nano-pdf` |
| `summarize` | `summarize` |
| `message_summarizer` | `summarize` |
| `spotify` | `spotify` + `brew install` |

## 恢复方式
若后续将上述 CLI 随包打包，或改为调用内置工具/MCP，可 `git mv` 回 `skills/<name>/` 重新启用。
