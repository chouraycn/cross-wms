# Fork Boundary — CDFKnowClow ↔ OpenClaw

> 本文件是产品（CDFKnowClow / `cross-wms`）与上游 OpenClaw 之间 **fork 边界的权威说明**。
> 配套：`openclaw-vendor-pin.json`（版本锚点）、`scripts/sync-openclaw.sh`（drift 检测）。
> 最后更新：2026-07-08。

---

## 1. 架构分层（三层，不是两层）

| 层 | 路径 | Git 跟踪 | 是否被产品构建/运行 |
|----|------|---------|-------------------|
| 上游参考副本 | `openclaw/`（OpenClaw `2026.6.9` 完整副本） | **否**（`.gitignore:47` 显式忽略 `openclaw/`） | **否** — 不在 pnpm workspace，仅作 vendored 参考 |
| 产品硬 fork | `packages/`（`@cdf-know/*`，v1.0.0，5 个包） | 是 | **是** — 真正运行的 agent 框架 |
| 产品应用 | `server/` + `src/` + `cli/` + `extensions/` | 是 | 是 |

**关键结论**：产品不是"在用 openclaw"，而是把它 **硬 fork 成了 `@cdf-know/*`** 工作区包。
`openclaw/` 目录是 git 忽略的嵌入式副本，**产品运行时完全不读它**。

---

## 2. `@cdf-know/*` 各包与 OpenClaw 的派生关系

| 产品包 | src 模块数 | 上游对应面 | 派生方式 |
|--------|-----------|-----------|---------|
| `@cdf-know/plugin-sdk` | 21 | OpenClaw `plugin-sdk`（83 模块） | **部分 fork**（取 ~21/83，已定制，抽样 0 个同名文件与上游一致） |
| `@cdf-know/agent-core` | 20 | OpenClaw `agent-core` / `src/agents` | 部分 fork（含 `embedded/`、`harness/`、`tracing.ts` 等产品扩展） |
| `@cdf-know/llm-core` | 8 | OpenClaw `llm-runtime` / `model-router` | 部分 fork（含自有 `provider.ts`） |
| `@cdf-know/memory-host-sdk` | 12 | OpenClaw memory 子系统（`memory-runtime` / `memory-state` / `memory-lancedb`） | **重新实现**（模块结构不同：`advanced-search`/`clustering`/`dreaming`/`multimodal`/`engine-storage`…，非 1:1 对应） |
| `@cdf-know/skill-core` | 13 | OpenClaw `skills` | 部分 fork |

**未跟踪的上游面**（fork 未覆盖、产品也未使用）：完整的 OpenClaw 应用壳、`extensions/` 下绝大多数扩展、渠道/网关、桌面端等。

---

## 3. Vendored `openclaw/` 现状

- 版本：`2026.6.9`（见 `openclaw/package.json` 与 `openclaw-vendor-pin.json`）。
- **无法钉 commit SHA**：`openclaw/` 被 `.gitignore` 忽略，非 submodule、无版本 pin、无更新脚本。刷新内嵌副本时须人工重写 `openclaw-vendor-pin.json` 并人工确认等价性。
- 与上游参考 `cdfknow`（同版本 2026.6.9）的 drift（2026-07-08 实测）：

  ```
  vendor files : 20669   ref files : 20301
  modified     : 37       ← 真内容分叉（见 §5 / §6）
  added(ref)   : 68       ← cdfknow 有、openclaw/ 缺（多为 src/plugin-sdk/test-helpers 等路径差异）
  added(vendor): 436      ← openclaw/ 有、cdfknow 缺（.github CI + .agents + 产品布局文件）
  relocated    : 58       ← 同内容不同路径（如 test-helpers 搬迁）
  ```

  运行 `./scripts/sync-openclaw.sh --ref ../cdfknow` 可随时复算。

---

## 4. 上次对齐同步的诚实结论（重要）

此前曾把 4 个上游修复同步进 `openclaw/`（memory-runtime / memory-state / memory-lancedb / create-dmg）。
**这 4 个文件落进了被 git 忽略的 `openclaw/` 参考副本，未触达产品运行时**：

- 3 个 memory 修复 → 目标 OpenClaw in-app memory 插件，产品用 `@cdf-know/memory-host-sdk` 替代，二者结构不同 → **fork 表面里根本没有这些模块**。
- 1 个 create-dmg 修复 → 落在 `openclaw/scripts/create-dmg.sh`，但产品实际打包用的是 **`cross-wms/scripts/create-dmg.sh`**（独立脚本）→ **未生效**。

因此那次同步对产品实际 AI 引擎 / 打包 **可能无效**。是否需 port，见 §6。

---

## 5. 37 处内容分叉的分类（来自 drift 脚本）

`scripts/sync-openclaw.sh` 将 `modified` 文件标为两类：

- **[SAFE]** 纯上游源码差异（如 `packages/plugin-sdk/src/*.ts` 的运行时/鉴权/安全模块）—— 多为上游较新，可安全刷新。
- **[REVIEW]** manifest / config / 入口 / 脚本（如 `package.json`、`tsconfig*.json`、`vitest.*.mjs`、`scripts/lib/*.mjs`、`packages/agent-core/src/index.ts`）—— **可能含产品定制，禁止盲目覆盖**，须逐文件 diff。

`added(vendor)` 中的 436 个文件绝大部分是产品布局差异（`.github`/`.agents` 与 `packages/` 重构），属 **刻意保留**，不应反向删除。

---

## 6. 4 个上游修复的 Port 评估

| # | 上游修复文件 | 目标层 | 产品对应面 | 结论 |
|---|------------|--------|-----------|------|
| 1 | `src/plugins/memory-runtime.ts` | OpenClaw in-app memory | `@cdf-know/memory-host-sdk`（重新实现，无同名模块） | **不 1:1，需语义比对，禁止 copy** |
| 2 | `src/plugins/memory-state.ts` | OpenClaw in-app memory | 同上 | 同上 |
| 3 | `extensions/memory-lancedb/index.ts` | OpenClaw 扩展 | `@cdf-know/memory-host-sdk`（无 lancedb 直连） | 同上 |
| 4 | `scripts/create-dmg.sh` | 打包脚本 | **`cross-wms/scripts/create-dmg.sh`（产品实际打包脚本）** | **建议 port，见下** |

### 修复 #4（DMG 背景图丢失）应 port 进 `cross-wms/scripts/create-dmg.sh`

上游修复的核心：关窗后 Finder 异步写 `.DS_Store`（含背景图引用），过早 `force detach` 会丢弃未刷盘内容。

**实测产品当前脚本**（`cross-wms/scripts/create-dmg.sh`，288 行，Jul 5）：
- 已有部分缓解：`sync` + `sleep 2`（约 L260–263，`v1.7.15` 注释）。
- **但仍保留早 force 根因**：`detach_dmg` 中 `if (( attempt >= 3 )) && hdiutil detach … -force`（约 L161）—— 即你此前定位的"第三次起 force 冲掉未刷盘 `.DS_Store`"问题。
- 上游修复将其改为 `attempt >= 8`，并新增 `wait_for_dsstore_flush()` 轮询 `.DS_Store` mtime 稳定。

**建议 port（待你确认后应用，因涉及产品打包行为变更）：**

```diff
--- a/scripts/create-dmg.sh
+++ b/scripts/create-dmg.sh
@@ detach_dmg() 重试循环 @@
-    if (( attempt >= 3 )) && hdiutil detach "$MOUNT_POINT" -force 2>/dev/null; then
+    if (( attempt >= 8 )) && hdiutil detach "$MOUNT_POINT" -force 2>/dev/null; then
```

可选增强（健壮性，对标上游 `wait_for_dsstore_flush`）：将 L260–263 的 `sync; sleep 2` 替换为轮询 `.DS_Store` mtime 稳定的循环，避免 CI runner 上偶发竞态。

### 修复 #1/#2/#3（memory）

`@cdf-know/memory-host-sdk` 是独立重实现，**无 `memory-runtime.ts` / `memory-state.ts` / `memory-lancedb` 直接对应模块**。
正确做法：取出这 3 个修复的 *语义 diff*，在 `memory-host-sdk` 中定位等价逻辑后单独重做，而非文件拷贝。
**当前建议：搁置**，待 ReAct v6.0 重写完成、memory 层稳定后再评估。

---

## 7. 推荐工作流（如何长期管理这份 fork）

1. **刷新 vendored `openclaw/`**：`bash scripts/sync-openclaw.sh --ref <上游>`，审阅 `modified` 的 [SAFE]/[REVIEW]，仅把 SAFE 同步进 `openclaw/` 与 `@cdf-know/*` 对应面，更新 `openclaw-vendor-pin.json`。
2. **CI 闸门（可选）**：`bash scripts/sync-openclaw.sh --ref <上游> --fail-on-drift` 接入 CI，drift 超阈值即失败。
3. **不要**反向删除 `added(vendor)` 中的产品布局文件（`.github`/`.agents`/`packages/` 重构）。
4. **ReAct v6.0 完成前**，不要切换地基（submodule / npm 依赖 / 维持硬 fork 待定）—— 中途换地基风险高。
