---
name: ClawHub 技能市场
id: clawhub
description: 搜索、安装、校验、更新、发布与同步 ClawHub 技能；所需能力缺失时先到市场检索
group: integration
requires: {}
userInvocable: true
gate: auto
sandboxScope: write
---

使用 `openclaw skills` 发现并管理当前 Agent 的技能；独立 `clawhub` CLI 仅用于发布、同步及发布者账户流程。公共注册中心：https://clawhub.ai

## 发现技能

在判定某项能力不可用之前，先在市场检索：

```bash
openclaw skills search "postgres backups"
```

安装前需校验所选技能，第三方技能一律视为不可信，安装前必须获得用户同意。

```bash
openclaw skills verify my-skill
openclaw skills install my-skill
openclaw skills install my-skill --version 1.2.3
```

## 管理已安装技能

```bash
openclaw skills list
openclaw skills check
openclaw skills update my-skill
openclaw skills update --all
```

`install` / `update` 搭配 `--global` 可管理所有本地 Agent 共享的技能。

## 发布技能

发布者流程需安装独立的 ClawHub CLI：

```bash
npm i -g clawhub
clawhub login
clawhub whoami
```

发布或同步技能：

```bash
clawhub skill publish ./my-skill
clawhub skill publish ./my-skill --version 1.2.3
clawhub sync --all
```

## 说明

- 公共注册中心：https://clawhub.ai
- `openclaw skills install` 默认安装到当前工作区。
- 共享安装使用 `--global`，对所有本地 Agent 可见（除非 Agent allowlist 收窄范围）。
- 第三方技能按不可信对待，安装前务必 `verify` 并征得用户同意。
