---
name: 文件读取
id: fs_read
description: 读取本地文件文本内容，仅支持只读查询
group: fs_read
parameters:
  type: object
  required: [path]
  properties:
    path:
      type: string
      description: 文件绝对/相对路径
    encoding:
      type: string
      default: utf-8
requires:
  os: [linux, darwin, win32]
  env: []
userInvocable: false
gate: auto
sandboxScope: workspace
---

读取文件仅允许工作目录内文件，禁止访问 ~/.ssh、/etc 等敏感路径；
文件不存在返回空提示，不抛出崩溃异常。
