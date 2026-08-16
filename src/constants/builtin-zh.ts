/**
 * 内置技能中文词典
 * --------------------------------------------------
 * 把 openclaw 合并到「内置」栏目的英文技能名/描述/分类
 * 统一映射为中文展示；已存在中文条目不覆盖。
 */

export interface BuiltinZhPatch {
  name: string;
  desc: string;
  category?: string;
  tags?: string[];
}

export const BUILTIN_ZH: Record<string, BuiltinZhPatch> = {
  '1password': {
    name: '1Password 密码管家',
    desc: '通过 1Password CLI 完成登录、桌面联动，以及读取或注入密钥。',
  },
  'apple-notes': {
    name: 'Apple 备忘录',
    desc: '在 macOS 上通过 memo CLI 创建、查看、编辑、删除、搜索、移动或导出 Apple 备忘录。',
  },
  'apple-reminders': {
    name: 'Apple 提醒事项',
    desc: '通过 remindctl 列出、新增、编辑、完成或删除 Apple 提醒事项及清单。',
  },
  'bear-notes': {
    name: 'Bear 笔记',
    desc: '通过 grizzly CLI 创建、搜索和管理 Bear 笔记。',
  },
  'blogwatcher': {
    name: '博客订阅监控',
    desc: '使用 blogwatcher CLI 监控博客与 RSS/Atom 订阅源的更新。',
  },
  'blucli': {
    name: 'BluOS 音响控制',
    desc: '通过 BluOS CLI（blu）进行设备发现、播放控制、分组和音量调节。',
  },
  'camsnap': {
    name: '摄像头截图',
    desc: '从 RTSP/ONVIF 摄像头抓取帧或短视频片段。',
  },
  'clawhub': {
    name: 'ClawHub 技能市场',
    desc: '在所需能力缺失时到 ClawHub 检索技能；支持安装、校验、更新、发布或同步技能。',
  },
  'coding-agent': {
    name: '编程代理',
    desc: '将编程任务委派给 Codex、Claude Code 或 OpenCode 作为后台 Worker 执行，适合非简单修改或只读查询的复杂场景。',
  },
  'diagram-maker': {
    name: '图表与白板',
    desc: '生成 SVG/HTML 或 Excalidraw 图，用于概念说明、架构、流程和白板。',
  },
  'eightctl': {
    name: 'Eight Sleep 温控',
    desc: '控制 Eight Sleep 睡床的状态、温度、闹钟和日程。',
  },
  'gemini': {
    name: 'Gemini CLI',
    desc: 'Gemini CLI 单次提示、摘要、生成、技能、Hook、MCP 或 Gemma 路由。',
  },
  'gh-issues': {
    name: 'GitHub Issue 修复代理',
    desc: '抓取 GitHub Issue，筛选候选，启动后台修复代理，打开 PR，并可选择处理 PR 评审评论。',
  },
  'gifgrep': {
    name: 'GIF 搜索下载',
    desc: '通过 CLI/TUI 搜索 GIF 提供商，下载结果，并提取静帧或拼贴图。',
  },
  'github': {
    name: 'GitHub 操作',
    desc: '通过 GitHub CLI 处理 Issue、PR、CI/check 日志、评论、评审、Release、仓库及 gh api 查询。',
  },
  'gog': {
    name: 'Google Workspace',
    desc: 'Google Workspace CLI，覆盖 Gmail、日历、云端硬盘、联系人、表格和文档。',
  },
  'goplaces': {
    name: 'Google Places 查询',
    desc: '通过 goplaces 以文本搜索、地点详情、解析、评论或可脚本化 JSON 查询 Google Places。',
  },
  'healthcheck': {
    name: '主机安全加固',
    desc: '审计并加固 OpenClaw 主机：SSH、防火墙、系统更新、暴露面、备份、磁盘加密、网关安全。',
  },
  'himalaya': {
    name: 'Himalaya 邮件',
    desc: 'Himalaya CLI 处理 IMAP/SMTP 邮件：列出、阅读、搜索、撰写、回复、转发、复制、移动、删除。',
  },
  'imsg': {
    name: 'iMessage/SMS',
    desc: 'iMessage/SMS CLI，列出聊天、历史记录，并通过 Messages.app 发送消息。',
  },
  'mcporter': {
    name: 'MCP 管理器 (mcporter)',
    desc: '通过 HTTP 或 stdio 列出、配置、认证、调用与检查 MCP 服务器与工具。',
  },
  'meme-maker': {
    name: 'Meme 生成',
    desc: '搜索 Meme 模板、推荐版式，并生成本地或云端图片 Meme。',
  },
  'model-usage': {
    name: '模型用量统计',
    desc: '按模型汇总 CodexBar 本地成本日志（Codex/Claude），包含当期或完整账单。',
  },
  'nano-pdf': {
    name: 'PDF 智能编辑',
    desc: '通过 nano-pdf CLI 用自然语言指令编辑 PDF。',
  },
  'node-connect': {
    name: 'Node 连接诊断',
    desc: '诊断 OpenClaw 的 Android/iOS/macOS Node 配对、二维码/引导码、路由、鉴权和连接失败问题。',
  },
  'node-inspect-debugger': {
    name: 'Node.js 调试器',
    desc: '通过 node inspect、--inspect、断点、CDP 调试 Node.js，分析堆内存与 CPU 性能。',
  },
  'notion': {
    name: 'Notion 协作',
    desc: 'Notion CLI/API 处理页面、Markdown 内容、数据源、文件、评论、搜索、Workers 及原始 API 调用。',
  },
  'obsidian': {
    name: 'Obsidian 知识库',
    desc: '通过官方 obsidian CLI 操作 Obsidian 库：读取/搜索/创建/编辑笔记、任务、链接、属性、插件。',
  },
  'openai-whisper': {
    name: '本地语音转文字 (Whisper)',
    desc: '无需 API Key，使用 Whisper CLI 在本地进行语音转文字。',
  },
  'openai-whisper-api': {
    name: 'Whisper API 转写',
    desc: '通过 curl 调用 OpenAI 音频转写 API，支持 gpt-4o-transcribe、mini、说话人分离或 whisper-1。',
  },
  'openhue': {
    name: 'Philips Hue 灯光',
    desc: '通过 OpenHue CLI 控制飞利浦 Hue 灯具和场景。',
  },
  'oracle': {
    name: 'Oracle 代码评审',
    desc: 'Oracle CLI 对选定文件进行二模型评审/调试/重构/设计、Token 预检、API 或浏览器引擎。',
  },
  'ordercli': {
    name: '外卖订单查询',
    desc: 'Foodora CLI 查看历史订单与当前订单状态（Deliveroo 开发中）。',
  },
  'peekaboo': {
    name: 'macOS UI 自动化',
    desc: '通过 Peekaboo CLI 抓取并自动化 macOS 图形界面。',
  },
  'python-debugpy': {
    name: 'Python 调试',
    desc: '通过 pdb、breakpoint()、死后检查与 debugpy 远程挂载调试 Python。',
  },
  'sag': {
    name: 'ElevenLabs 语音合成',
    desc: '基于 ElevenLabs 的 TTS，提供 macOS say 风格的使用体验。',
  },
  'session-logs': {
    name: '会话日志分析',
    desc: '使用 jq 搜索并分析自己的会话日志（更早或父级对话）。',
  },
  'sherpa-onnx-tts': {
    name: '本地 TTS (Sherpa)',
    desc: '通过 sherpa-onnx 进行离线语音合成（无需联网）。',
  },
  'skill-creator': {
    name: 'AgentSkill 生成器',
    desc: '创建、编辑、审计、整理、校验或重构 AgentSkills 与 SKILL.md。',
  },
  'songsee': {
    name: '音频频谱可视化',
    desc: '通过 songsee CLI 从音频生成频谱图和特征面板图。',
  },
  'sonoscli': {
    name: 'Sonos 音响控制',
    desc: '控制 Sonos 音箱（发现/状态/播放/音量/分组）。',
  },
  'spike': {
    name: '原型验证',
    desc: '运行一次性原型来验证可行性、对比方案，并输出结论。',
  },
  'spotify-player': {
    name: 'Spotify 终端播放器',
    desc: '通过 spogo（优先）或 spotify_player 在终端中搜索与播放 Spotify。',
  },
  'summarize': {
    name: 'URL/音视频摘要',
    desc: '对 URL、YouTube/视频、播客、文章、转录稿、PDF 或本地文件进行摘要或转写。',
  },
  'taskflow': {
    name: 'TaskFlow 任务编排',
    desc: '将多步离线任务组织为一个持久的 TaskFlow 作业，带所有者上下文、状态、等待与子任务。',
  },
  'taskflow-inbox-triage': {
    name: 'TaskFlow 收件箱模板',
    desc: '示例 TaskFlow 模板：收件箱分类、意图路由、等待回复并后续总结。',
  },
  'things-mac': {
    name: 'Things 3 任务',
    desc: '在 macOS 上新增、更新、列出、搜索或查看 Things 3 待办、收件箱、今日、项目、领域与标签。',
  },
  'tmux': {
    name: 'tmux 会话管理',
    desc: '通过 tmux 会话/窗格运行交互式 CLI：列出、抓取输出、发送按键、粘贴文本、监控提示。',
  },
  'trello': {
    name: 'Trello 看板',
    desc: '通过 Trello REST API 管理看板、列表与卡片。',
  },
  'video-frames': {
    name: '视频抽帧',
    desc: '通过 ffmpeg 从视频抽取帧或短视频片段。',
  },
  'weather': {
    name: '天气查询',
    desc: '通过 web_fetch 获取当前天气与预报，降级使用 wttr.in curl：地点、降水、温度、出行建议。',
  },
  'xurl': {
    name: 'X/Twitter 操作',
    desc: 'xurl CLI 处理 X 的认证发帖、回复、阅读与搜索、私信、媒体上传、粉丝、认证状态或原始 v2 API。',
  },
  'analytics-data-analysis': {
    name: '数据分析',
    desc: '使用 Python、Jupyter 和现代数据工具实现数据分析、可视化的最佳实践。',
  },
  'web-search': {
    name: '网络搜索',
    desc: '通过 DuckDuckGo 及其他搜索引擎进行联网搜索。',
  },
  // ========== WMS 仓储业务技能 ==========
  'builtin-agent': {
    name: 'WMS 智能体',
    desc: '6 种预设角色智能体（仓储专家/分析师/运营/通用/调试/仓储专员），应对不同业务场景。',
    category: 'ai-agent',
    tags: ['WMS', '智能体', '角色'],
  },
  'builtin-automation': {
    name: '自动化任务中心',
    desc: '调度和管理仓储自动化任务：入库、出库、盘点、预警、报表定时执行。',
    category: 'auto',
    tags: ['WMS', '自动化', '调度'],
  },
  'builtin-dashboard': {
    name: '仓储数据看板',
    desc: '可视化仓储核心指标：库存、出入库、订单、库龄、预警，一屏总览。',
    category: 'data',
    tags: ['WMS', '看板', '仪表盘'],
  },
  'builtin-data-analysis': {
    name: 'WMS 数据分析',
    desc: '基于 WMS 业务数据做多维分析：趋势、对比、Top 排名、异常诊断。',
    category: 'data',
    tags: ['WMS', '分析', '报表'],
  },
  'builtin-inbound': {
    name: '入库管理',
    desc: '创建、查询、审核入库单；支持采购入库、退货入库、调拨入库等多种类型。',
    category: 'core',
    tags: ['WMS', '入库', '采购', '退货'],
  },
  'builtin-inventory': {
    name: '库存管理',
    desc: '多仓库、多 SKU 库存查询与维护：数量、批次、序列号、库位、状态。',
    category: 'core',
    tags: ['WMS', '库存', 'SKU', '库位'],
  },
  'builtin-inventory-query': {
    name: '自然语言库存查询',
    desc: '用中文直接查询库存："哪个SKU库存最多"、"最近7天出入库趋势"、"哪些商品需要补货"。',
    category: 'ai-agent',
    tags: ['WMS', '查询', 'NLQ', '自然语言'],
  },
  'builtin-inventory-snapshot': {
    name: '库存快照',
    desc: '按日/周/月生成库存快照，支持库存历史回溯与对比分析。',
    category: 'data',
    tags: ['WMS', '快照', '历史', '库存'],
  },
  'builtin-metrics': {
    name: '仓储指标中心',
    desc: '全量仓储 KPI 指标定义、计算与追踪：周转率、准确率、作业效率、库容利用率。',
    category: 'data',
    tags: ['WMS', 'KPI', '指标'],
  },
  'builtin-outbound': {
    name: '出库管理',
    desc: '创建、波次、拣货、复核、发运出库单；支持销售出库、调拨出库、退货出库。',
    category: 'core',
    tags: ['WMS', '出库', '销售', '波次'],
  },
  'builtin-reports': {
    name: 'WMS 报表中心',
    desc: '仓储标准报表：日/周/月报、出入库明细、库存账龄、作业绩效、成本分析。',
    category: 'document',
    tags: ['WMS', '报表', '导出'],
  },
  'builtin-shortcut': {
    name: '快捷入口',
    desc: '高频操作快捷入口：快速建单、扫码作业、一键盘点、库存查询。',
    category: 'productivity',
    tags: ['WMS', '快捷', '效率'],
  },
  'builtin-tencent-docs': {
    name: '飞书文档集成',
    desc: '把 WMS 报表/看板数据同步到飞书文档或多维表格，支持链接分享与协同。',
    category: 'communication',
    tags: ['飞书', '文档', '集成', '协同'],
  },
  'builtin-transit': {
    name: '调拨管理',
    desc: '仓库间调拨业务：创建调拨单、在途跟踪、调入确认、差异处理。',
    category: 'core',
    tags: ['WMS', '调拨', '在途', '移仓'],
  },
  'builtin-volume': {
    name: '库容管理',
    desc: '仓库与库位容量管理：面积、体积、承重、SKU 容纳量、占用率预警。',
    category: 'core',
    tags: ['WMS', '库容', '库位', '容量'],
  },
  'builtin-warehouse': {
    name: '仓库与库位',
    desc: '仓库、库区、库位基础档案维护：结构、属性、编码、作业区划分。',
    category: 'core',
    tags: ['WMS', '仓库', '库位', '档案'],
  },
  'builtin-warehouse-kpi': {
    name: '仓库 KPI 驾驶舱',
    desc: '仓库级 KPI 总览与下钻：准时率、准确率、人效、坪效、设备利用率。',
    category: 'data',
    tags: ['WMS', 'KPI', '驾驶舱', '绩效'],
  },
  'wms_daily_report': {
    name: 'WMS 日报生成',
    desc: '自动汇总当日仓储运营数据生成日报，可发送邮件或推送飞书。',
    category: 'document',
    tags: ['WMS', '日报', '汇总'],
  },
  'wms_inbound_create': {
    name: '入库单创建',
    desc: '按模板快速创建 WMS 入库单（采购/退货/调拨），支持批量导入与校验。',
    category: 'core',
    tags: ['WMS', '入库单', '创建', '批量'],
  },
  'wms_inventory_check': {
    name: '库存盘点',
    desc: '发起盘点任务：动盘、抽盘、全盘；生成差异报表、自动过账调整。',
    category: 'core',
    tags: ['WMS', '盘点', '差异', '调整'],
  },
  'wms_outbound_create': {
    name: '出库单创建',
    desc: '按订单快速创建 WMS 出库单（销售/调拨/退货），支持波次合并。',
    category: 'core',
    tags: ['WMS', '出库单', '创建', '波次'],
  },
  'wms_stock_query': {
    name: '库存查询助手',
    desc: '多维度查询 WMS 实时库存：仓库、SKU、批次、库位、状态；可导出 Excel。',
    category: 'data',
    tags: ['WMS', '库存', '查询', '导出'],
  },
  'wms_transfer_create': {
    name: '调拨单创建',
    desc: '跨仓库调拨单创建：指定调出/调入仓、SKU 数量、在途跟踪与签收。',
    category: 'core',
    tags: ['WMS', '调拨单', '创建'],
  },
  // ========== 通用与开发工具技能 ==========
  'brainstorm': {
    name: '头脑风暴',
    desc: '结构化头脑风暴与思维导图生成，辅助发散思维、提炼方案、沉淀结论。',
    category: 'productivity',
    tags: ['思考', '创意', '思维导图'],
  },
  'calc': {
    name: '计算器',
    desc: '高精度数学计算：基本运算、单位换算、百分比、公式求值与日期计算。',
    category: 'tool',
    tags: ['计算', '数学', '工具'],
  },
  'cn-email': {
    name: '国内邮箱',
    desc: 'QQ/163/企业微信邮箱等国内邮件收发、草稿、附件管理与搜索。',
    category: 'communication',
    tags: ['邮件', 'QQ邮箱', '163邮箱'],
  },
  'code-review': {
    name: '代码评审',
    desc: '自动化代码评审：风格、规范、安全、复杂度检查，输出评审意见与建议。',
    category: 'development',
    tags: ['开发', '评审', '代码质量'],
  },
  'data_analyzer': {
    name: '通用数据分析',
    desc: '加载 CSV/Excel/数据库数据，执行清洗、聚合、透视、可视化并生成分析报告。',
    category: 'data',
    tags: ['分析', '数据', '可视化'],
  },
  'doc-writer': {
    name: '文档写作助手',
    desc: '辅助撰写技术文档、需求说明、会议纪要、周报月报；支持 Markdown 与模板。',
    category: 'document',
    tags: ['写作', '文档', 'Markdown'],
  },
  'exec_cmd': {
    name: '命令执行',
    desc: '在安全沙箱中执行 Shell 命令与脚本，适合自动化运维与批量处理场景。',
    category: 'development',
    tags: ['终端', 'Shell', '命令'],
  },
  'fs_read': {
    name: '文件读取',
    desc: '读取本地或工作区文件：文本、JSON、CSV、Markdown、代码片段内容。',
    category: 'tool',
    tags: ['文件', '读取'],
  },
  'hscode-assistant': {
    name: 'HS 编码助手',
    desc: '海关商品编码（HS Code）智能查询与归类建议，支持中文品名反查。',
    category: 'tool',
    tags: ['海关', 'HS', '编码', '贸易'],
  },
  'memory_search': {
    name: '记忆搜索',
    desc: '在历史对话与长期记忆库中语义检索相关内容，辅助上下文衔接。',
    category: 'ai-agent',
    tags: ['记忆', '检索', '语义搜索'],
  },
  'notes': {
    name: '随手笔记',
    desc: '快速记录、整理、搜索个人笔记；支持标签、文件夹、Markdown 格式。',
    category: 'productivity',
    tags: ['笔记', '记录', 'Markdown'],
  },
  'pdf_exporter': {
    name: 'PDF 导出',
    desc: '把报表、文档、图表、对话内容、网页导出为格式精美的 PDF 文件。',
    category: 'document',
    tags: ['PDF', '导出', '报表'],
  },
  'task-planner': {
    name: '任务规划器',
    desc: '把复杂目标拆解为可执行子任务：优先级、依赖、排期、验收标准。',
    category: 'productivity',
    tags: ['任务', '规划', '拆解'],
  },
  'todo': {
    name: '待办清单',
    desc: '个人与团队待办管理：新建、完成、优先级、到期提醒、清单分组。',
    category: 'productivity',
    tags: ['待办', '任务', '清单'],
  },
  'translator': {
    name: '翻译助手',
    desc: '多语言文本互译：中英日韩等；支持文档翻译、术语表、风格调整。',
    category: 'tool',
    tags: ['翻译', '多语言', 'i18n'],
  },
};
