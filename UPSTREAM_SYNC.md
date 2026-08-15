# 上游同步台账（UPSTREAM_SYNC.md）

> 硬分叉（OpenClaw baseline）长效同步记录。
> 流程见 `deliverables/2026-08-13-上游分叉治理runbook.md`。
> 铁律：绝不全量 merge；A 类直接 cherry-pick，B 类走适配层；每次同步 = 1 PR + 本台账记录。

---

## 0. 上游锚点状态

| 项 | 值 | 备注 |
|----|----|------|
| `openclaw` remote | ✅ **已配置**（2026-08-15） | `https://github.com/openclaw/openclaw` |
| 上游 tip | `107f03d1`（`fix(agents): publish resolved model identity in agents_list output (#123044)`） | 2026-08-15 浅拉取（depth 1 + blob:none） |
| 本仓基线快照 | `sync/openclaw-2026-08-04` = `5976f186` | 本仓 2026-08-04 安全快照（非上游流） |
| **真实分叉距离** | **✅ 已实测（2026-08-15，blob OID 对比）** | 见 §1.1 |
| `main` 领先快照 | 108 commits（08-13 口径，非分叉距离） | — |

### 1.1 真实分叉距离（vs openclaw tip `107f03d1`，上游 `src/` ↔ 本地 `server/engine/`）

| 维度 | 上游 src | 本地 server/engine | 共有 | 内容相同 | 已本地改动 | 仅上游 | 仅本地 |
|---|---|---|---|---|---|---|---|
| 全部文件 | 14,164 | 11,626 | 7,893 | **763（9.7%）** | 7,130（90.3%） | 6,271 | 3,733 |
| **非测试文件** | 8,397 | 7,478 | 4,541 | **254（5.6%）** | 4,287（94.4%） | 3,856 | 2,937 |
| 测试文件 | 5,767 | 4,148 | 3,352 | 509（15.2%） | 2,843 | 2,415 | 796 |

**结论**：非测试共享文件仅 5.6% 与上游一致——分叉比 08-13 预估的（33% 独有 / 55% 已改 / 12% 相同）更深。
**全量 merge 彻底不可行**；治理只能走「选择性 cherry-pick 叶子通用修复 + 冲突适配层」。

---

## 2. 快照刷新记录

| 日期 | 快照分支 | 上游 sha | 本仓 merge-base | 操作者 |
|------|----------|----------|-----------------|--------|
| 2026-08-04 | `sync/openclaw-2026-08-04` (5976f186) | （本仓快照，非上游） | 0b1bcdd9 | 自动 safety backup |
| 2026-08-15 | `openclaw/main`（浅拉取 depth 1，未建存档分支） | `107f03d1` | —（硬分叉无公共历史） | 治理启动 |

> 待办：定频全量快照时 `git fetch openclaw` + `git branch -f sync/openclaw-$(date +%F) openclaw/main`。

---

## 3. cherry-pick / 适配层明细（每次同步填一行）

| 批次 | 日期 | 上游 sha | 类别(A/B/C) | 目标文件/模块 | 处理方式 | 冲突/回归 | tsc | 测试 | PR |
|------|------|----------|-------------|---------------|----------|-----------|-----|------|----|
| 1 | 2026-08-15 | `0982ee57` | A | acp/*.test.ts ×6 | `git show \| sed src→server/engine \| git apply --3way` | 无冲突；**no-op**（文件已在 tip 状态） | — | — | — |

字段说明：
- **类别**：A=叶子非冲突通用修复（直接 `git cherry-pick -x`）；B=engine 核心/已改文件/冲突（走适配层）；C=功能新增（默认不取）。
- **处理方式**：cherry-pick / `git diff ... | git apply --3way` / `*.adapter.ts` 垫片。
- **回归**：受影响模块定向测试结果；engine 改动须 `test:engine` 门禁在线（CI 已挂 build:packages→openclaw/dist→test:engine 硬门禁，2026-08-15 核验）。

---

## 4. 遗留冲突 / 待办

- [x] 配置 `openclaw` remote 并 fetch（depth 1 + blob:none，2026-08-15）
- [x] 真实分叉距离实测回填（§1.1）
- [x] 深拉取上游历史（depth 120，2026-08-15）
- [x] **首次 A 类 cherry-pick 演练（2026-08-15，批次 1）**：120 commits 仅 1 候选（`0982ee57`，测试文件），应用为 no-op（文件已同步）
- [ ] **A 类候选近乎空集（实证）**：最近 120 commits 仅 1 个命中双端相同文件（且为测试文件）——日常治理重心 = 安全/关键修复的适配层 backport + 季度快照对比，而非例行 cherry-pick
- [ ] 连续 2 季度有记录 → 达成"受控 fork 健康态"
