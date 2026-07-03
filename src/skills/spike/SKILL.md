---
name: Spike 原型验证
id: spike
description: 运行一次性原型以验证可行性、对比方案并给出结论；用于"快速验证""这可行吗""对比 A/B"
group: util
requires: {}
userInvocable: true
gate: auto
sandboxScope: none
---

当用户想在正式构建前测试一个想法时使用："spike 一下"、"快速原型"、"这可行吗"、"对比 A/B"、"构建之前"。

当阅读文档/源码即可回答，或用户明确要求生产实现时，不要使用。

## 循环

1. 问题：陈述具体的可行性问题。
2. 调研：阅读足够的文档/源码，选定可信方案。
3. 构建：创建最小的可运行产物来验证或否定想法。
4. 压测：尝试一个边界情况或失败模式。
5. 结论：`VALIDATED`、`PARTIAL` 或 `INVALIDATED`。

## 产物形态

- 默认工作区：`.tmp/openclaw-spikes/<slug>`，除非用户要求仓库内可追踪路径。
- 仓库内选项：`spikes/<NNN-slug>/`，含 `README.md` 与最小代码。
- 优先可运行 CLI、小型 HTML、单个端点或聚焦测试。
- 避免依赖泛滥、Docker、env 文件、应用框架与生产级清理。

## 多问题拆分

- 拆分为 2-5 个独立问题。
- 先跑风险最高的那个。
- A/B 对比时，输入保持一致，度量相同维度。
- 若工作量超出小型原型，先征得同意再构建所有变体。

## 结论格式

```markdown
## Verdict: VALIDATED | PARTIAL | INVALIDATED

Question: ...
Evidence: 精确的命令/输出/度量。
What worked: ...
What failed or surprised us: ...
Recommendation: ship / adjust / avoid，含下一步生产建议。
```

## 规则

- 被否定的 spike 同样有价值——它用证据排除了一条路径。
- 不要将 spike 代码直接合入生产，需按常规重写。
- 若评估外部依赖，检查健康度：近期 release/commit、文档、许可证、安装难度。
