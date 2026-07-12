# OpenClaw 独立分析报告

> 分析对象：`/cross-wms/openclaw`（被 git 忽略的 vendored 参考副本，版本 v2026.6.9 附近）
> 分析日期：2026-07-12
> 背景：cdf-know-clow 是 OpenClaw 的硬 fork，本文件独立分析 OpenClaw 本体（不重复对比，对比见另一份报告）

---

## 1. 一句话定位

**OpenClaw 是一个 local-first（本地优先）的多通道个人 AI 助手**。作者 Peter Steinberger（steipete）与社区，MIT 许可证，吉祥物是太空龙虾 Molty。演进史：Warelay → Clawdbot → Moltbot → OpenClaw。

核心主张（VISION.md 首句）：**"The AI that actually does things. It runs on your devices, in your channels, with your rules."** —— 强调"真能干事"（真实工具调用 + 真实计算机操作），而非聊天玩具。

---

## 2. 产品形态与卖点

| 卖点 | 说明 |
|------|------|
| Local-first Gateway | 单一控制面，统一管会话 / 通道 / 工具 / 事件 |
| Multi-channel inbox | 25+ 消息通道：WhatsApp/Telegram/Slack/Discord/Signal/iMessage/Matrix/Feishu/WeChat/QQ/Zalo/… |
| Multi-agent routing | 入站按通道/账号/对端路由到隔离 agent（workspaces + 每 agent 会话） |
| Voice Wake + Talk | macOS/iOS 唤醒词、Android 连续语音（ElevenLabs + 系统 TTS 兜底） |
| Live Canvas | agent 驱动的视觉工作区（A2UI） |
| First-class tools | browser / canvas / nodes / cron / sessions / Discord·Slack 动作 |
| Companion apps | Windows Hub、macOS 菜单栏、iOS/Android node |
| Onboarding + skills | 引导式配置 + ClawHub 技能市场 |

安全默认：DM 配对（pairing），未知发送者先拿配对码；非 main 会话默认进 Docker 沙箱。

---

## 3. 整体架构（pnpm monorepo）

```
openclaw/
├── packages/        23 个 @openclaw/* 核心包
├── extensions/      139 个扩展（通道/LLM/工具/平台/语音/媒体/记忆/QA）
├── apps/            6 个原生 app（android/ios/macos/macos-mlx-tts/shared/swabble）
├── docs/            详尽文档（concepts/channels/gateway/platforms/automation/security/maturity/specs/refactor/scenarios…）
├── qa/              成熟度评分 + scenarios
├── test/            e2e + 架构气味 + 扩展边界测试
├── Dockerfile(19KB) docker-compose fly.toml appcast.xml(自动更新)
├── AGENTS.md(37KB)  SECURITY.md(35KB)  CHANGELOG.md(2.6MB)
└── README.md(87KB)
```

### 3.1 核心包（23 个，`packages/`）
acp-core · agent-core · gateway-client · gateway-protocol · llm-core · llm-runtime · markdown-core · media-core · media-generation-core · media-understanding-common · memory-host-sdk · model-catalog-core · net-policy · normalization-core · plugin-package-contract · **plugin-sdk** · sdk · speech-core · terminal-core · **tool-call-repair** · web-content-core

> 关键包：`agent-core`（可复用 agent 内核）、`llm-core`/`llm-runtime`（模型/provider 抽象）、`plugin-sdk`（插件契约）、`tool-call-repair`（**修复畸形工具调用——cdf 缺失的健壮性层**）、`memory-host-sdk`（记忆宿主契约）。

### 3.2 扩展（139 个，`extensions/`）
每个扩展通过 `package.json` 的 `openclaw.extensions` 字段注册入口（`index.ts` 在扩展根目录），由包管理器发现加载。规模惊人：
- **通道类**：discord(118k 行)、telegram(110k)、matrix(86k)、slack、whatsapp、signal、imessage、feishu、wechat、qqbot、zalo、line、irc、msteams、mattermost、nextcloud-talk、nostr、synology-chat、tlon、twitch、googlechat、sms、webhooks…
- **LLM Provider 类**：openai/codex、anthropic(-vertex)、google、deepseek、qwen、moonshot、mistral、groq、cohere、cerebras、together、perplexity、xai、openrouter、cloudflare-ai-gateway、vercel-ai-gateway、ollama、vllm、sglang、lmstudio、llama-cpp、litellm、novita、deepinfra、chutes、arcee、fireworks、huggingface、volcengine、stepfun、minimax、kimi-coding、qianfan、tencent、alibaba、microsoft(-foundry)、nvidia、amazon-bedrock(-mantle)、copilot(-proxy)、github-copilot…（约 **52 个 provider 路径**）
- **工具类**：browser、canvas、file-transfer、phone-control、device-pair、parallel、synthetic、media、document-extract
- **语音/媒体类**：voice、talk-voice、elevenlabs、deepgram、azure-speech、senseaudio、inworld、tts-local-cli；image-generation-core、video-generation-core、music-generation、comfy、fal、runway、pixverse、vydra、gradium
- **记忆类**：active-memory + 3 个 memory-* 扩展（"同一时刻仅一个记忆插件激活"）
- **QA/诊断/迁移/策略**：qa-matrix、qa-lab、qa-channel、diagnostics-prometheus、diagnostics-otel、migrate-hermes、migrate-claude、policy、net-policy、thread-ownership
- **开发代理类**：codex、opencode、kilocode、codex-supervisor、raft

### 3.3 原生 app（6 个，`apps/`）
android · ios · macos · macos-mlx-tts（本地 MLX TTS）· shared · swabble

---

## 4. 核心引擎：Agent Runtime 架构

源码布局（`docs/agent-runtime-architecture.md`）：
- `src/agents/embedded-agent-runner/`：**内置 attempt loop、provider stream 适配器、compaction、模型选择、会话接线**
- `src/agents/sessions/`：会话持久化、扩展加载、资源发现、skills、prompts、themes、TUI 工具渲染
- `packages/agent-core/`：可复用 agent 内核、harness 类型、消息、compaction、prompt 模板、tool/session 契约
- `src/agents/runtime/`：对 `@openclaw/agent-core` 的 facade
- `src/agents/agent-tools*.ts`：内置工具定义、schema、policy、hook 适配器、host edit
- `src/agents/agent-hooks/`：compaction 护栏、context 裁剪
- `src/llm/`：model/provider registry、transport、provider 特定 stream

**运行时选择**：默认内置 runtime id = `openclaw`；插件 harness 可注册额外 runtime id；`auto` 在有支持插件时用插件、否则回退内置。

**边界纪律**：核心通过 SDK barrel（`openclaw/plugin-sdk/*`）调用内置 runtime，**不**直接 import 旧外部 agent 包；插件只走 `openclaw/plugin-sdk/*`，**禁止** import `src/**` 内部。TUI 用第三方 `@earendil-works/pi-tui`。

> 重要差异：OpenClaw 的引擎是**单一 attempt loop**（embedded-agent-runner），**不是** cdf-know-clow 的 4 策略体系（Legacy/Observer/Planner/ReAct）。cdf 在引擎层大幅偏离了上游。

---

## 5. 能力广度与完成度（来自自带成熟度账本）

OpenClaw 自带工程化成熟度追踪（`qa/maturity-scores.yaml`，2026-06-22 快照）：
- **50 个 surface（活跃面）× 281 个 category**
- 总体：surface 平均 quality **63（Alpha）/ completeness 70（Beta）**；category 平均 quality 64 / completeness 71
- 每个 surface 有 quality + completeness 双评分 + LTS 标记

按 family 的完成度画像（节选自 50 surface）：

| Family | 代表 surface | 完成度(Q/C) | 判读 |
|--------|-------------|------------|------|
| **core** | Gateway runtime | 81/89 | 最成熟，Stable |
| core | CLI | 83/90 | 最成熟 |
| core | Agent Runtime | 78/79 | 成熟 |
| core | Session/memory/context | 77/79 | 成熟 |
| core | Channel framework | 76/79 | 成熟 |
| core | Security/auth/pairing | 72/79 | 成熟 |
| core | Observability | 75/79 | 成熟 |
| core | Automation(cron/hooks) | 72/79 | 成熟 |
| core | Gateway Web App | 74/79 | 成熟 |
| core | Media understanding/gen | 64/68 | 中等 |
| core | Voice & realtime talk | 61/68 | 中等偏早 |
| core | TUI | 59/66 | 偏早 |
| core | ClawHub | 58/62 | 偏早 |
| core | App SDK | 54/53 | 偏早 |
| **platform-app** | macOS Gateway host | 74/88 | 强 |
| platform-app | Linux Gateway host | 75/89 | 强 |
| platform-app | macOS companion | 66/78 | 中等 |
| platform-app | Windows(WSL2) | 69/79 | 中等 |
| platform-app | Native Windows | 58/66 | 偏早 |
| platform-app | Android app | 59/66 | 偏早 |
| platform-app | **Linux companion** | **19/21** | 极早期 |
| platform-app | **Native Windows companion** | **19/21** | 极早期 |
| platform-app | **iOS / watchOS / Nix** | **41/44** | 极早期 |
| **channel** | Discord | 73/87 | 最强通道 |
| channel | Telegram/WhatsApp/Slack/iMessage | 66-68/78 | 成熟 |
| channel | Signal/GoogleChat/Matrix/MSTeams | 59-60/66-67 | 中等 |
| channel | 长尾(IRC/LINE/Mattermost/Nostr/Tlon…) | 53/54 | 偏早 |
| channel | 区域(Feishu/QQ/WeChat/Zalo/Yuanbao) | 55/58 | 偏早 |
| channel | Voice Call channel | 41/44 | 极早期 |
| **provider-tool** | OpenAI/Codex | 74/79 | 成熟 |
| provider-tool | Anthropic / Google / OpenRouter | 66-71/78 | 成熟 |
| provider-tool | 本地模型(Ollama/vLLM/…) | 61/68 | 中等 |
| provider-tool | 长尾 hosted providers | 61/68 | 中等 |
| provider-tool | Browser/exec/sandbox tools | 75/79 | 成熟 |
| provider-tool | Web search tools | 74/79 | 成熟 |
| provider-tool | Image/video/music gen | 61/68 | 中等 |

**判读**：
- **Gateway / CLI / 核心 runtime / 通道框架 / 安全 / 自动化** 是最稳的部分（completeness 79+，多数 Stable）。
- **平台 app 两极分化严重**：macOS/Linux Gateway host 完成度 88-89，但 companion app（Linux/Win native/iOS/watchOS/Nix）只有 19-44——这些是"画了地盘、尚未填实"。
- **区域通道（中文生态 Feishu/QQ/WeChat 等）完成度仅 55-58**，明显落后于 Discord(87)。
- **媒体生成 / 语音 / TUI / ClawHub / App SDK** 仍 Beta/Alpha。

---

## 6. 工程成熟度信号（这是 OpenClaw 最值得借鉴之处）

| 信号 | 证据 |
|------|------|
| 类型/ lint 闸门 | `pnpm check`（lint+typecheck）、`pnpm build`、oxlint 配置 |
| 测试体系 | vitest；`src/agents/agent-*.test.ts` 系列；`OPENCLAW_LIVE_TEST=1` 真实 provider 测试；`test/` 含 e2e + `architecture-smells` + `extension-import-boundaries` + `extension-package-tsc-boundary` + `extension-test-boundary`；depth-2 有 63 个 `.test.ts` |
| **模块化边界强制** | 扩展 import 边界测试 + `tsconfig.package-boundary.*.json` —— 把"禁止插件 import src 内部"做成 CI 硬门 |
| 安全供应链 | SECURITY.md(35KB)、.pre-commit、.semgrepignore、codeql、actionlint、dependabot、`.env.example` |
| 文档与 specs | `docs/specs`（claw-supervisor）、`docs/refactor`（acp/canvas/database-first/ingress-core/access）、`qa/scenarios`（agents/channels/character/config/media/memory/models/personal） |
| 发布/部署 | CHANGELOG 2.6MB、appcast.xml（自动更新）、Dockerfile、docker-compose、fly.toml |
| Agent 自控指令 | AGENTS.md 37KB 作为编码规约喂给 AI 协作 |

> 小结：OpenClaw 的**工程纪律密度**远高于一般开源 AI 项目——边界测试、成熟度量化、scenarios、refactor 档案俱全。这是它作为"被 fork 地基"最有价值的部分。

---

## 7. 治理取向（VISION.md 的"不合并"清单——关键）

VISION.md 明确列了**暂不合并（What We Will Not Merge）**，这是理解其架构取舍的钥匙：
- 新核心 skills（应走 ClawHub）
- 全量文档翻译集
- 不符合 model-provider 类别的商业集成
- 围绕已支持通道的 wrapper 通道（无能力/安全差距）
- 重复 MCP/ACPX/plugin/ClawHub 路径的工作
- **Agent 层级框架（manager-of-managers / 嵌套 planner 树）作为默认架构 ❌**
- **重型编排层（复制现有 agent/tool 基础设施）❌**

> 这直接与 cdf-know-clow 的路线冲突：cdf 的 ReAct v6 **实现了 planner DAG + 动态重规划**（嵌套规划树），恰好落在 OpenClaw 明确拒绝的"默认架构"之列。这意味着 cdf 在引擎层的偏离是**有意为之的产品决策**，而非无意漂移——回归上游时这部分几乎无法 upstream。

---

## 8. 总体完成度结论

**OpenClaw 是一个"核心控制面成熟、生态广度铺开但深浅不均、平台 app 两极分化"的早期但工程化的项目。**

- **成熟度自评分**：completeness 平均 ~70（Beta），quality ~63（Alpha）。它自己在 VISION 里也写"We are still early, so iteration is fast"。
- **强项**：Gateway 控制面、CLI、内置 agent runtime、通道框架、安全/沙箱、自动化、Web 搜索/浏览器工具、OpenAI/Anthropic/Google provider。
- **弱项/早期**：中文区域通道、媒体生成、语音/talk、TUI、ClawHub、App SDK，以及几乎所有 mobile/companion app（除 macOS/Linux Gateway host）。
- **独特资产**：139 扩展生态 + 23 包 + 6 app 的广度；tool-call-repair 健壮性层；plugin-sdk 边界纪律；成熟度量化体系。

---

## 9. 与 cdf-know-clow 的关系定位（简）

（详细对比见 `deliverables/openclaw-vs-cdfklow-完整度分析.md`，此处仅定位）

- cdf-know-clow = OpenClaw **v2026.6.9 硬 fork**，运行时为 `@cdf-know/*`（5 包），`openclaw/` 是 vendored 参考副本、运行时不读它。
- **cdf 在引擎层超规格自研**：4 策略（Legacy/Observer/Planner/ReAct）、Auto 模型路由、sqlite-vec 向量记忆——这些上游没有或明确拒绝（嵌套 planner）。
- **cdf 刻意未跟随的上游广度**：25 通道、52 provider、Canvas、语音、媒体生成、mobile app——与 cdf 的 WMS 桌面场景无关。
- **cdf 可向上游学的**：plugin-sdk/边界测试/成熟度量化/tool-call-repair/scenarios 这套工程纪律；以及中文区域通道（Feishu/WeChat/QQ）上游仅 55-58 分，cdf 若有需求可反向贡献。

---

## 10. 对 cdf-know-clow 的下一步观察建议

1. **吸收上游工程纪律，而非功能**：把 `extension-import-boundaries` / `tsconfig.package-boundary` 思路落地为 cdf 的 knip CI 闸门 + 模块边界测试，防"死代码全做"成果回潮。
2. **关注 tool-call-repair 思路**：cdf 缺畸形工具调用修复层，可借鉴上游 `packages/tool-call-repair` 设计。
3. **中文通道是双向机会**：上游区域通道分低（55-58），若 cdf 做国内 WMS 协同场景，Feishu/WeChat/QQ 是低垂果实。
4. **保持引擎层自主**：ReAct v6 的 planner DAG 是 cdf 产品差异点，但需意识到它**无法 upstream**——fork 边界要长期维持，不要试图把这部分"同步回"上游。
5. **建立自己的成熟度账本**：上游有 `qa/maturity-scores.yaml`，cdf 也应有一份"死代码激活 / 能力收口"的量化基线，避免功能清单凭感觉。

---

*数据来源：openclaw/README.md、VISION.md、docs/agent-runtime-architecture.md、qa/maturity-scores.yaml（2026-06-22 快照）、packages/、extensions/、apps/ 实地清点。*
