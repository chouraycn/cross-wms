---
name: 终端会话管理
id: tmux
description: 控制 tmux 会话/窗格，用于交互式 CLI：列表、捕获输出、发送按键、粘贴文本、监控提示符
group: dev
requires: { bins: ["tmux"] }
userInvocable: true
gate: auto
sandboxScope: write
---

用于已存在的交互式 tmux 会话。一次性命令使用普通 shell。新建非交互后台任务使用后台执行。

## 基础

```bash
tmux ls
tmux list-windows -t shared
tmux list-panes -t shared:0
tmux capture-pane -t shared:0.0 -p
tmux capture-pane -t shared:0.0 -p -S -
```

目标格式：`session:window.pane`，例如 `shared:0.0`。

## 发送输入

先发送字面文本，再发送回车：

```bash
tmux send-keys -t shared:0.0 -l -- "Please continue"
tmux send-keys -t shared:0.0 Enter
```

特殊按键：

```bash
tmux send-keys -t shared:0.0 C-c
tmux send-keys -t shared:0.0 C-d
tmux send-keys -t shared:0.0 Escape
```

任意文本使用 `-l --`。将文本与回车分开发送，避免粘贴/换行意外。

## 会话

```bash
tmux new-session -d -s worker
tmux rename-session -t old new
tmux kill-session -t worker
```

## 提示符检查

```bash
tmux capture-pane -t worker-3 -p | tail -20
tmux capture-pane -t worker-3 -p | rg "proceed|permission|Yes|No|❯"
```

仅在理解提示符含义时才批准/选择：

```bash
tmux send-keys -t worker-3 -l -- "y"
tmux send-keys -t worker-3 Enter
```

## 辅助脚本

- `scripts/find-sessions.sh`：发现会话。
- `scripts/wait-for-text.sh`：等待窗格输出包含指定文本。

## 说明

- `capture-pane -p` 将内容打印到 stdout，便于脚本处理。
- `-S -` 捕获完整滚动历史。
- tmux 会话在 SSH 断开后依然保持。
