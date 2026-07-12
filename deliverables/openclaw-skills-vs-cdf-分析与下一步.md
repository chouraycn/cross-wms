# openclaw 技能体系 vs 当前软件（cdf-know-clow）分析与下一步方向

> 分析对象：`/cross-wms/openclaw`（OpenClaw v2026.6.9 硬 fork 上游）的技能体系
> 对比基准：当前 `cdf-know-clow` 运行时与技能资产
> 日期：2026-07-12

---

## 1. 总览对比（数字说话）

| 维度 | openclaw（上游） | 当前 cdf-know-clow |
|---|---|---|
| 内置技能 `skills/` | **52** 个 SKILL.md 定义 | 搬运 **18** 个（已重写为 cdf schema） |
| cdf 自有技能 | 0 | **4** 核心（calc/exec/file/memory）+ **6** WMS 业务 = **10** |
| 扩展（extensions） | **120+**（含 feishu/qqbot/tencent/wechat 生态、deepseek/moonshot 等国产厂商） | **7**（arcee/document-extract/fal/groq/memory-core/qwen/voice-call/xai） |
| 技能引擎代码量 | `src/skills/` **约 114 文件 / 9 模块** | `packages/skill-core` **7 模块** + server 侧 plugin-sdk/registry/loader/bridge/workshop |
| 技能 schema | openclaw 原生 frontmatter（description/requires/install/os…） | cdf **增强 schema**（name/id/description/group/parameters/requires/**gate**/**sandboxScope**） |
| 运行时加载方式 | loader 直接扫描 `skills/`、`extensions/*/skills`、workspace、bundled 目录 | pluginLoader 扫描 **`AppPaths.pluginsDir`**（外部运行时目录），**非源码 `src/skills`** |

**一句话结论**：上游在「技能数量 + 扩展生态 + 原生引擎」三个维度全面领先；当前在「安全 schema（gate/sandboxScope）+ advanced-triggers 智能触发 + WMS 业务技能 + 技能工坊安全隔离」四个点上有差异化优势，但**源码里的 28 个技能定义大概率未真正加载进运行时**（数据链路 P0 死区）。

---

## 2. 技能清单差距（52 → 28 已搬运/自有）

### 2.1 已搬运的 18 个（openclaw → `src/skills/`，已重写为 cdf schema）
`blucli camsnap clawhub gemini gifgrep github gog imsg notion openhue oracle sag songsee spike tmux trello weather xurl`

### 2.2 cdf 自有 10 个
- 核心 4：`calc exec file memory`（语义搜索/只读执行/文件读取/计算器）
- WMS 业务 6：`data_analyzer message_summarizer pdf_exporter wms_daily_report wms_inbound_create wms_stock_query`

### 2.3 未搬运的 34 个，按 WMS 产品相关性分级

| 优先级 | openclaw 技能 | 与 WMS/企业产品的相关性 |
|---|---|---|
| **高**（企业协作/生产力） | `notion trello gog(Google Workspace) himalaya(邮件) things-mac obsidian` | 仓储管理人员日常协作、文档、邮件、任务流 |
| **高**（开发/工程） | `gh-issues coding-agent mcporter node-inspect-debugger python-debugpy` | 内部 IT/二次开发/排障 |
| **中**（内容/文档） | `summarize diagram-maker nano-pdf video-frames meme-maker openai-whisper*` | 报告生成、图表、PDF 编辑、语音转写 |
| **中**（平台能力） | `skill-creator session-logs model-usage taskflow taskflow-inbox-triage` | 技能自举、会话回溯、成本、长任务编排 |
| **低**（消费级桌面） | `1password apple-notes apple-reminders bear-notes sonoscli spotify-player eightctl ordercli goplaces blogwatcher healthcheck node-connect peekaboo sherpa-onnx-tts` | 对个人 Mac 用户有用，对垂直 WMS 产品价值极低 |

> 渠道类技能（slack/discord/whatsapp/telegram/line/matrix/msteams 等）在 openclaw 里是 **extensions** 而非 `skills/`，见 §5。

---

## 3. 技能引擎架构差距（最关键的技术差距）

openclaw `src/skills/` 引擎模块（文件数）：
- `config`(1) · `discovery`(**15**) · `lifecycle`(**22**) · `loading`(**32**) · `research`(**4**) · `runtime`(**21**) · `security`(**5**) · `test-support`(**7**) · `workshop`(**7**)

当前 `packages/skill-core/`（7 模块）：
- `loader` · `registry` · `security-scanner` · `version-manager` · `advanced-triggers` · `types` + server 侧 `plugin-sdk / pluginRegistry / pluginLoader / skillPluginBridge / skillWorkshop`

### 当前**缺**（openclaw 有，当前无或极弱）
- **discovery**（能力→技能解析索引，15 文件）—— 当前只有 advanced-triggers，没有"技能目录索引"
- **research**（按能力找技能 / clawhub 检索，4 文件）—— 当前无
- **lifecycle**（激活/停用、工作区优先级、版本同步，22 文件）—— 当前仅有基础 version-manager + pluginRegistry enable/disable
- **runtime**（21 文件）：cron-snapshot、env-overrides、refresh、remote、session-snapshot、snapshot-hydration、embedded-run-entries、tool-dispatch —— 当前**完全没有**后台/定时/快照类执行能力
- **test-support**（7 文件）—— 当前无
- **security** 的 workspace-audit + clawhub-verdicts（供应链信任）—— 当前仅有 security-scanner + skillWorkshop.scanContent

### 当前**独有优势**（openclaw 没有，务必守住）
1. **advanced-triggers**：统一触发器引擎，支持 `semantic / fuzzy / contextual / composite / ai-classifier` 五种匹配。openclaw 没有等价物，这是 cdf 真正的差异化卖点。
2. **安全 schema 内建**：`gate`(auto/ask/high-risk) + `sandboxScope`(none/read/write/workspace) 直接写进 SKILL.md。比 openclaw「分离式安全模块」更企业就绪。
3. **skillWorkshop 带隔离**：`scanContent` 发现 critical 即自动 quarantine（参考 openclaw workshop 但更严）。openclaw 的 workshop 更宽松。
4. **WMS 业务技能**：6 个领域技能，openclaw 一个都没有。

---

## 4. 运行时接线死区（最该先修的 P0）

`server/engine/pluginLoader.ts` 的加载路径是 **`AppPaths.pluginsDir`**（运行时外部插件目录），**不扫描源码 `src/skills/` 与 `skills/`**。

这意味着：
- 当前 28 个技能定义是**源码/编写态资产**，未必已安装进 `pluginsDir` 并激活；
- `skillPluginBridge` 与 `skillWorkshop` 是"桥"与"工坊"，但**从源码定义到运行时激活的链路可能未打通**（与历史结论"P0 = 数据链路打通"一致）。

**验证动作**：先确认 `calc/exec/file/memory` 4 个 cdf 核心技能能否端到端跑通；若不能，则 28 个技能整体处于"搬运未激活"状态，优先级高于一切新搬运。

---

## 5. 最大战略缺口：中国企业集成（在 extensions 层，不在 skills 层）

openclaw 的 **120+ 扩展**里藏着对 cdf 最高价值的资产——**中国企业与国产模型生态**：

- **企业渠道**：`feishu`（飞书，自带 4 个 skills：feishu-doc / feishu-drive / feishu-perm / feishu-wiki）、`qqbot`、`tencent`/`wechat` 生态、`line`、`telegram`、`whatsapp`、`matrix`、`msteams`、`slack`、`googlechat`、`mattermost`、`nextcloud-talk`、`synology-chat`、`zalo`…
- **国产 LLM 厂商**：`deepseek`、`moonshot`、`qwen`(当前已有)、`minimax`、`qianfan`、`stepfun`、`volcengine`(字节)、`zai`、`senseaudio`、`kimi-coding`、`byteplus`(字节)…

当前扩展**仅 7 个**，只有 `qwen` 一个中国厂商，**飞书/企微/钉钉/QQ/微信渠道全空**。

> 对"中国企业仓储（WMS）"产品而言，**飞书/企微/钉钉 + deepseek/moonshot/minimax** 是刚需，也是 openclaw 给 cdf 的**最大可搬运价值**——比那 52 个生产力技能值钱得多。

---

## 6. 下一步方向（优先级路线）

### P0 — 激活与渠道（最高杠杆，先做）
1. **打通技能数据链路**：把 `src/skills` + `skills/` 的 28 个定义真正安装/激活进 `pluginsDir` 并接 `skillPluginBridge`；先验证 `calc/exec/file/memory` 端到端跑通（消 P0 死区）。
2. **接入中国企业渠道扩展**（从 openclaw 搬运）：`feishu`（含 4 个 skills）、`企微/wechat-work`、`dingtalk`、`qqbot`。优先级：飞书 > 企微 > 钉钉 > QQ。
3. **接入国产 LLM provider 扩展**：`deepseek`、`moonshot`、`minimax`、`qianfan`、`volcengine`。当前仅 qwen。

### P1 — 选择性搬运高价值技能（按 §2.3 分级）
- 企业协作/生产力：`notion trello gog himalaya things-mac obsidian`
- 开发/工程：`gh-issues coding-agent mcporter`
- 内容/文档：`summarize diagram-maker nano-pdf`
- **暂缓**消费级桌面 18 个（对 WMS 低价值，搬运只增加维护负担）

### P2 — 吸收 openclaw 引擎能力（补齐，不与 advanced-triggers 冲突）
- **discovery + research**：建"能力→技能"索引，与 cdf 的 advanced-triggers 组合成**独有"智能技能路由"**（定位成卖点，而非抄 openclaw 的 discovery）。
- **lifecycle 增强**：多租户/工作区技能开关 + 版本同步（version-manager 基础已够，补 workspace precedence）。
- **security 增强**：加 workspace-audit + clawhub-verdicts（供应链信任），与现有 security-scanner 互补。

### P3 — 不追广度，守差异化
- 消费级桌面技能暂不动。
- **WMS 业务技能扩面**（当前 6 个太薄，这是 cdf 真护城河，openclaw 完全没有）：`wms_outbound`(出库)、`wms_inventory_adjust`(库存调整)、`wms_procurement`(采购)、`wms_alert`(预警)、`wms_report_builder`(报表搭建)。
- `workshop/test-support` 仅当 cdf 要开放技能市场时再搬运。

---

## 7. 决策建议

cdf 是**垂直 WMS 产品**，openclaw 是**通用 AI 助手**。不要对标其广度（52 技能 + 120 扩展是通用定位的必然结果）。

cdf 的护城河 = ① **advanced-triggers 智能触发**（已领先）② **WMS 业务技能**（需扩面）③ **中国企业集成**（飞书/企微/钉钉 + 国产模型，openclaw 最大可搬运资产）④ **行业合规/权限**（gate + sandboxScope 已领先）。

**下一步把 openclaw 当"中国渠道 + 国产模型 + 高价值生产力技能"的供应商，而非对标对象。** 先把 P0 的"数据链路死区"和"中国企业渠道"拿下，比再搬运 30 个消费级技能重要一个数量级。

---

### 附：快速验证清单（建议本周执行）
- [ ] `calc/exec/file/memory` 是否在运行时真正可用（验证 pluginsDir 激活链路）
- [ ] `src/skills` 是否进入 pluginLoader 扫描范围（若无，记录为 P0 死区）
- [ ] 从 openclaw `extensions/feishu` 搬运可行性评估（4 skills + channel 接入成本）
- [ ] `deepseek` / `moonshot` provider 扩展搬运成本评估
