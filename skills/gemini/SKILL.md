---
name: gemini
description: "Gemini CLI 一次性提示、摘要、生成、技能、钩子、MCP 或 Gemma 路由。"
homepage: https://ai.google.dev/
metadata:
  {
    "openclaw":
      {
        "emoji": "✨",
        "requires": { "bins": ["gemini"] },
        "install":
          [
            {
              "id": "brew",
              "kind": "brew",
              "formula": "gemini-cli",
              "bins": ["gemini"],
              "label": "Install Gemini CLI (brew)",
            },
          ],
      },
  }
---

# Gemini CLI

以无头一次性（headless one-shot）模式使用 Gemini。位置参数文本会进入交互模式，请使用 `-p/--prompt` 触发单次调用。

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

- 如需鉴权，先交互式运行一次 `gemini` 并完成登录流程。
- 为安全起见，避免使用 `--yolo`。
