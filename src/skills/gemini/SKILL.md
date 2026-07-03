---
name: Google Gemini AI
id: gemini
description: 调用 Google Gemini AI 模型进行一次性问答、摘要与生成
group: integration
requires:
  env: ["GEMINI_API_KEY"]
userInvocable: true
gate: auto
sandboxScope: none
---

使用 Gemini 进行无头一次性（headless one-shot）调用。位置参数文本会进入交互模式，请使用 `-p/--prompt` 触发单次调用。

## 快速开始

- `gemini -p "回答这个问题..."`
- `gemini -m <model> -p "提示词..."`
- `gemini -p "返回 JSON" --output-format json`
- stdin 追加到 `-p`：`cat notes.md | gemini -p "总结一下"`

## 扩展能力

- 列出扩展：`gemini --list-extensions`
- 管理扩展：`gemini extensions <command>`
- Skills：`gemini skills <command>`
- Hooks：`gemini hooks <command>`
- MCP：`gemini mcp <command>`

## 注意事项

- 鉴权依赖 `GEMINI_API_KEY` 环境变量；如需交互式登录，先运行一次 `gemini` 并完成登录流程。
- 为安全起见，避免使用 `--yolo`。
