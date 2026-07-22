---
name: skill-creator
description: 帮助用户创建新技能，生成 SKILL.md 模板
version: 1.0.0
triggers:
  - keyword:创建技能
  - keyword:技能模板
  - keyword:skill creator
category: development
tags: skill, development, scaffold, template
metadata:
  crosswms:
    category: development
    executionMode: tool
    source: builtin
    status: active
---

# Skill Creator 技能创建脚手架

帮助用户快速创建新技能，生成标准化的 SKILL.md 模板和 index.ts 实现框架。

## 功能

- 生成 SKILL.md 模板（含 frontmatter 元数据）
- 生成 index.ts 实现框架
- 支持自定义名称、描述、分类
- 自动生成工具函数模板

## 使用示例

```
创建一个名为 my-skill 的技能
生成一个数据分析技能模板
帮我创建一个处理 PDF 的技能
```

## 工具函数

- `skill_creator_generate(name, description?, category?)` - 生成技能模板
- `skill_creator_validate(skillContent)` - 验证 SKILL.md 格式
