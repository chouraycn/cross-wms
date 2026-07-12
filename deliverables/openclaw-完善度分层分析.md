# OpenClaw 完善度分层分析（对独立分析报告的补充）

> 分析对象：`/cross-wms/openclaw`（v2026.6.9 附近 vendored 参考副本）
> 分析日期：2026-07-12
> 补充动机：前一份 `openclaw-独立分析报告.md` 用了 surface 的 quality/completeness 分数，但**没用每个 surface 自带的 `level` 档位字段**——而 `level`（M0–M4）比分数更能区分"真做 vs 半做 vs 空壳"。本报告补全这一维度，并验证关键弱项是否真为壳。
> 数据来源：`qa/maturity-scores.yaml`（2026-06-22 快照，50 surface × 281 category）

---

## 1. 一句话结论

**OpenClaw 的"纸面庞大"（139 扩展 / 23 包 / 6 app）严重名不副实：50 个能力面中，真正稳定+可用的仅 27 个（5 Stable + 22 Beta），其余 23 个（17 Alpha + 4 Experimental + 2 Planned）是半做或空壳。** 它的真实完善度集中在"Gateway 控制面 + 主流通道/Provider/工具"这一窄核心，生态广度大量是占位。

---

## 2. 方法论：`level` 档位（关键增量维度）

成熟度账本每个 surface 自带 `level` 字段，比 quality/completeness 分数更能说明"做到什么程度"：

| 档位 | code | 含义 | 判读 |
|------|------|------|------|
| **Stable** | M4 | 稳定可用 | 真做、可依赖 |
| **Beta** | M3 | 功能完整、待打磨 | 真做、基本可用 |
| **Alpha** | M2 | 做了但不成熟 | 半做、有坑 |
| **Experimental** | M1 | 刚起步 | 弱原型 |
| **Planned** | M0 | 已规划未实施 | **空壳/占位** |

---

## 3. 完整 50-surface 档位表

### 3.1 Stable（M4，5 个）— 真做且可依赖
| surface | family |
|---------|--------|
| Gateway runtime | core |
| CLI | core |
| macOS Gateway host | platform-app |
| Linux Gateway host | platform-app |
| Discord | channel |

> 注意：5 个 Stable 里 2 个是 **macOS/Linux Gateway host**——这恰好印证 OpenClaw 的核心价值是"**本地能跑起来的控制面**"，而非那些花哨的通道/移动端。

### 3.2 Beta（M3，22 个）— 真做、基本可用
**core（9）：** Plugins(plugin-sdk) · Agent Runtime · Session/Memory/Context · Channel framework · Security/Auth/Pairing · Observability · Automation(cron/hooks) · Gateway Web App · macOS companion app
**platform-app（4）：** Windows via WSL2 · Raspberry Pi · Docker/Podman hosting · （注：macOS companion 归此）
**channel（5）：** Telegram · WhatsApp · Slack · iMessage(BlueBubbles) · （注：主流 4 个）
**provider-tool（7）：** OpenAI/Codex · Anthropic · Google · OpenRouter · Web search tools · Browser/exec/sandbox tools · （注：前 4 provider + 2 工具）

### 3.3 Alpha（M2，17 个）— 半做、有坑
**core（5）：** Media understanding/generation · Voice & realtime talk · TUI · ClawHub · App SDK
**platform-app（3）：** Native Windows · Android · Kubernetes hosting
**channel（6）：** Signal · Google Chat · Matrix · MS Teams · 长尾通道簇(Mattermost/LINE/IRC…) · **区域通道簇(Feishu/QQ/WeChat/Yuanbao/Zalo)**
**provider-tool（3）：** Local model providers(Ollama/vLLM…) · Long-tail hosted providers · Image/Video/Music gen tools

### 3.4 Experimental（M1，4 个）— 弱原型
| surface | family |
|---------|--------|
| iOS app | platform-app |
| watchOS companion surfaces | platform-app |
| Nix install path | platform-app |
| Voice Call channel | channel |

### 3.5 Planned（M0，2 个）— **空壳/占位**
| surface | family | 佐证 |
|---------|--------|------|
| Linux companion app | platform-app | 分数 19/21，5 category 全 `supported_categories: 0` |
| Native Windows companion app | platform-app | 分数 19/21，同上 |

---

## 4. 完善度量化：真做 vs 半做 vs 空壳

```
Stable  ████████████████████████  5  (10%)
Beta    ████████████████████████████████████████████████████████  22 (44%)
Alpha   ███████████████████████████████████████  17 (34%)
Exp     ████████████  4  (8%)
Planned ██████  2  (4%)
                              └─ 真做层 27 (54%) ─┘  └─ 半做/空壳 23 (46%) ─┘
```

**核心判读**：
- **真做层（Stable+Beta）= 27 个 ≈ 54%**——这是 OpenClaw 的真实地基：Gateway 控制面、CLI、内置 agent runtime、主流 4 通道 + 主流 4 provider + 浏览器/搜索工具。
- **半做/空壳层（Alpha+Exp+Planned）= 23 个 ≈ 46%**——接近一半能力面是"画了地盘没填实"。尤其移动端（除 macOS/Linux Gateway host 外全在 Alpha/Exp/Planned）、媒体生成、语音、中文区域通道。

---

## 5. 空壳/弱项验证（不是拍脑袋）

| 怀疑项 | 验证方式 | 结论 |
|--------|----------|------|
| Linux/Win **companion app 是空壳** | 读 maturity-scores：`level: planned`(M0) + `supported_categories: 0/total: 5` + 分数 19/21 | ✅ 确认空壳，仅占位 |
| **中文区域通道**（Feishu/QQ/WeChat）弱 | `level: alpha`(M2) + 分数 55/58（全 surface 最低档之一） | ✅ 确认"列了名但做得差"——cdf 若有国内 WMS 协同需求，这是**低垂反向贡献果实** |
| **tool-call-repair 是否真做**（cdf 缺此层，吸收重点） | `Glob packages/tool-call-repair/src/**/*.ts` → 5 个真实源文件：`stream-normalizer / payload / grammar / promote / index` | ✅ 确认**真有实现**，非桩。是 cdf 应借鉴的健壮性资产 |
| iOS/watchOS 移动端 | `level: experimental`(M1) + 分数 41/44 | ✅ 弱原型，勿抄 |

---

## 6. 对 cdf-know-clow 的可操作清单（落地前一份建议）

### 6.1 高优先吸收（上游真做、cdf 缺）
1. **tool-call-repair 思路** — `openclaw/packages/tool-call-repair/src/` 有完整实现（grammar/payload/stream-normalizer/promote）。cdf 当前用"三层防御补丁"修 `tool_calls` 配对 400 错误，**应借鉴上游做结构化的工具调用修复层**，替换临时补丁。
2. **plugin-sdk 边界纪律** — 已在 P1 用 knip + CI 门禁落地（见 `knip.config.ts` / `pr-quality-gate.yml`）。
3. **成熟度量化体系** — 上游有 `qa/maturity-scores.yaml`，cdf 应建自己的"能力收口账本"，避免功能清单凭感觉（P0–P3 改进路线即缺乏量化基线）。

### 6.2 中优先吸收（上游 Beta 成熟、cdf 可用）
4. **多 Provider 抽象**（OpenAI/Anthropic/Google/OpenRouter 均 Beta）— cdf 的 Auto Model v2.0 已自研，可对照上游 provider 抽象补盲区。
5. **Web 搜索 / 浏览器自动化工具**（Beta）— 若 cdf WMS 场景需要，上游实现可作参考。

### 6.3 双向机会（上游弱、cdf 可反向贡献）
6. **中文区域通道**（Feishu/QQ/WeChat 仅 Alpha 55/58）— 若 cdf 做国内 WMS 协同/通知场景，这是上游明确短板，cdf 可独立做并反哺。

### 6.4 明确规避（上游也不完善，勿抄）
7. **Planned 空壳**：Linux/Win companion app——纯占位，无任何参考价值。
8. **Experimental 弱原型**：iOS/watchOS/Nix/Voice Call——刚起步，勿投入。
9. **Alpha 但与 WMS 无关**：媒体生成（Image/Video/Music）、语音/Talk、TUI、ClawHub、App SDK——上游自身不成熟，且与 cdf 桌面 WMS 场景无关。
10. **25 通道全量** — cdf 刻意未跟随，维持"窄核心"正确。

---

## 7. 总体完善度结论（修正前一份报告）

前一份报告给的"completeness 均分 ~70(Beta)"是**被 Stable/Beta 拉高后的平均数**，掩盖了"46% 能力面是半做/空壳"的事实。修正后结论：

> **OpenClaw 是一个"窄核心真做、生态广度大量占位"的项目。** 它的真实完善度 ≈ 54%（27/50 真做），且真做部分高度集中在 Gateway 控制面 + 4 主流通道 + 4 主流 Provider + 浏览器/搜索工具。**作为 cdf 的 fork 地基，值得吸收的是它的工程纪律（边界测试/成熟度量化/tool-call-repair）和窄核心抽象，而非它的生态广度——后者近半是壳。**

---

*补充自：qa/maturity-scores.yaml（level 字段逐 surface 提取）、packages/tool-call-repair/src 实地 Grep。本文件是对 `openclaw-独立分析报告.md` 的完善，不重复其架构/体量/治理取向内容。*
