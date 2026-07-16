# Fork Boundary — CDFKnowClow ↔ OpenClaw

> 本文件是产品（CDFKnowClow / `cross-wms`）与上游 OpenClaw 之间 **fork 边界的权威说明**。
> 配套：`openclaw-vendor-pin.json`（版本锚点）、`scripts/sync-openclaw.sh`（drift 检测）。
> 最后更新：2026-07-16（v9.0 切 submodule 架构）。

---

## 1. 架构分层（三层，submodule 方案）

| 层 | 路径 | Git 跟踪 | 是否被产品构建/运行 |
|----|------|---------|-------------------|
| 上游参考 submodule | `openclaw/`（git submodule，指向 github.com/cdfknow/openclaw） | **是**（通过 `.gitmodules` 管理，commit SHA 钉死） | **否** — 不在 pnpm workspace，仅作参考和同步源 |
| 产品包 | `packages/`（`@cdf-know/*`，v1.0.0+，22 个包） | 是 | **是** — 真正运行的 agent 框架 |
| 产品应用 | `server/` + `src/` + `cli/` + `extensions/` | 是 | 是 |

**关键结论**：产品不是"在用 openclaw"，而是把它 **submodule 化作为上游参考**，`@cdf-know/*` 工作区包是实际运行时。
`openclaw/` 目录现为 git submodule，**产品运行时完全不读它**，仅用于 drift 检测和同步上游修复。

---

## 2. `@cdf-know/*` 各包与 OpenClaw 的派生关系

| 产品包 | src 模块数 | 上游对应面 | 派生方式 |
|--------|-----------|-----------|---------|
| `@cdf-know/plugin-sdk` | 21 | OpenClaw `plugin-sdk`（83 模块） | **部分 fork**（取 ~21/83，已定制） |
| `@cdf-know/agent-core` | 20 | OpenClaw `agent-core` / `src/agents` | 部分 fork（含 `embedded/`、`harness/`、`tracing.ts` 等产品扩展） |
| `@cdf-know/llm-core` | 8 | OpenClaw `llm-runtime` / `model-router` | 部分 fork（含自有 `provider.ts`） |
| `@cdf-know/memory-host-sdk` | 12 | OpenClaw memory 子系统（`memory-runtime` / `memory-state` / `memory-lancedb`） | **重新实现**（模块结构不同） |
| `@cdf-know/skill-core` | 13 | OpenClaw `skills` | 部分 fork |
| `@cdf-know/acp-core` | 8 | OpenClaw `src/acp` | 同步 |
| `@cdf-know/gateway-client` | 12 | OpenClaw `src/gateway` | 同步 |
| `@cdf-know/llm-runtime` | 15 | OpenClaw `src/llm` | 同步 |
| `@cdf-know/markdown-core` | 6 | OpenClaw `src/ui/ui/markdown.ts` | 同步 |

**未跟踪的上游面**：完整的 OpenClaw 应用壳、`extensions/` 下绝大多数扩展、渠道/网关、桌面端等。

---

## 3. Submodule `openclaw/` 现状

- 版本：`2026.6.9`（见 `openclaw/package.json` 与 `openclaw-vendor-pin.json`）。
- **已钉 commit SHA**：`dfcbb34d9d4494c69f12f42c03e160a525f6c712`（通过 `git update-index` 钉死）。
- 配置：`.gitmodules` 指向 `git@github.com:cdfknow/openclaw.git`，branch `main`。
- **更新流程**：在 `openclaw/` 子目录执行 `git pull` → 在主项目执行 `git add openclaw` → 更新 `openclaw-vendor-pin.json` 的 `pinnedCommit`。

---

## 4. 架构决策变更（2026-07-16）

### 变更前：硬 fork + drift CI
- `openclaw/` 被 `.gitignore` 忽略，为嵌入式副本
- 无法钉 commit SHA，版本锚点靠人工维护
- drift 检测靠 `scripts/sync-openclaw.sh --fail-on-drift`

### 变更后：submodule + npm
- `openclaw/` 转为 git submodule，commit SHA 可追溯
- `.gitmodules` 管理远程仓库地址和分支
- `openclaw-vendor-pin.json` 记录当前 pin 的 commit 和版本
- 上游更新通过 `git submodule update --remote` 拉取
- drift CI 仍通过 `scripts/sync-openclaw.sh` 检测

### 变更原因
1. **版本可追溯**：submodule 天然支持 commit SHA 钉死，避免人工维护版本锚点的错误
2. **更新流程标准化**：`git submodule update --remote` 提供标准的上游同步机制
3. **CI 简化**：无需额外检测 `.gitignore` 状态，submodule 状态由 git 原生管理
4. **社区兼容**：符合开源项目使用 submodule 的惯例

---

## 5. 上游修复的 Port 评估

| # | 上游修复文件 | 目标层 | 产品对应面 | 结论 |
|---|------------|--------|-----------|------|
| 1 | `src/plugins/memory-runtime.ts` | OpenClaw in-app memory | `@cdf-know/memory-host-sdk`（重新实现） | **不 1:1，需语义比对** |
| 2 | `src/plugins/memory-state.ts` | OpenClaw in-app memory | 同上 | 同上 |
| 3 | `extensions/memory-lancedb/index.ts` | OpenClaw 扩展 | `@cdf-know/memory-host-sdk`（无 lancedb 直连） | 同上 |
| 4 | `scripts/create-dmg.sh` | 打包脚本 | **`cross-wms/scripts/create-dmg.sh`** | **已 port** |

### 修复 #4（DMG 背景图丢失）— 已 port 进 `cross-wms/scripts/create-dmg.sh`

上游修复的核心：关窗后 Finder 异步写 `.DS_Store`（含背景图引用），过早 `force detach` 会丢弃未刷盘内容。

**实测产品当前脚本**：
- 已有 `wait_for_dsstore_flush()` 与 `attempt >= 8` 重试阈值
- 修复已实际落地，无需再应用

---

## 6. 推荐工作流（如何长期管理 submodule）

1. **拉取上游更新**：
   ```bash
   cd openclaw && git pull origin main && cd ..
   git add openclaw .gitmodules
   ```

2. **更新版本锚点**：
   - 更新 `openclaw-vendor-pin.json` 的 `pinnedCommit`、`version`、`embeddedAt`
   - 在 `FORK_BOUNDARY.md` 记录本次同步的范围

3. **运行 drift 检测**：
   ```bash
   bash scripts/sync-openclaw.sh --ref ../cdfknow
   ```
   - 审阅 `modified` 的 [SAFE]/[REVIEW]
   - 仅把 SAFE 同步进 `@cdf-know/*` 对应面

4. **CI 闸门**：`bash scripts/sync-openclaw.sh --fail-on-drift` 接入 CI，drift 超阈值即失败。

5. **不要**反向删除 `openclaw/` 中的产品布局文件（`.github`/`.agents`/`packages/` 重构）。

---

## 7. NPM 依赖策略

`@cdf-know/*` 包当前为 pnpm workspace 本地包，未来可考虑：

- **npm publish**：将 `@cdf-know/*` 发布到 npm 私有仓库，作为独立包管理
- **混合模式**：部分基础包（如 `llm-core`、`plugin-sdk`）发布为 npm 包，业务包保持 workspace 模式
- **依赖声明**：在 `package.json` 中声明对 `@openclaw/*` 的 peer dependency，确保版本兼容性

当前阶段建议维持 workspace 模式，待包结构稳定后再评估 npm 发布策略。
