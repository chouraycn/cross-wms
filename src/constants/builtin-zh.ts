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
};
