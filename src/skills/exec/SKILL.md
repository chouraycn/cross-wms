---
name: 命令执行
id: exec_cmd
description: 执行 Shell 命令，仅支持只读查询类命令
group: runtime_exec
parameters:
  type: object
  required: [command]
  properties:
    command:
      type: string
      description: Shell 命令
    timeout:
      type: number
      default: 30000
      description: 超时时间(ms)
requires:
  os: [linux, darwin, win32]
userInvocable: false
gate: ask
sandboxScope: workspace
---

仅允许执行只读查询命令（ls, cat, grep, find 等），禁止 rm, chmod, sudo 等危险命令。
命令超时自动终止，返回 stdout/stderr/exitCode。
