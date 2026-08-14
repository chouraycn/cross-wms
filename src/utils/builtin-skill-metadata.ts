/**
 * builtin-skill-metadata
 * ------------------------------------------------------------
 * 为内置（openclaw 合并）技能推导：
 *   1) icon — 根据 id/name/description/category/tags 中的关键词匹配到
 *      一个语义化的 MUI icon name（在 AVAILABLE_ICON_NAMES 里）；
 *   2) trigger 关键词提示 — 优先使用 SKILL.md 中声明的 triggers/trigger，
 *      否则从 name/desc/tags/id 提取有代表性的关键词。
 *
 * 这是前端展示层的轻量推导器（纯函数），不改动后端 DB。
 */

export interface SkillMetaInput {
  id: string;
  name?: string;
  description?: string;
  desc?: string;
  category?: string;
  tags?: string[];
  trigger?: string;
  triggers?: string[];
  sourcePath?: string;
  icon?: string;
  executionMode?: string;
  version?: string;
  author?: string;
  featured?: boolean;
}

// ---------------- 关键词 → icon 优先级映射表 ----------------
// 顺序代表优先级（命中越靠前的规则，越优先返回）
const KEYWORD_ICON_RULES: Array<{ icon: string; keys: RegExp }> = [
  // GitHub / 代码仓库 / 评审
  { icon: 'Source', keys: /github|gh-|pull request|issue|repo|repository|git/i },
  { icon: 'BugFix', keys: /gh-issues|issue fix|bug fix|review|code review/i },
  { icon: 'Code', keys: /coding|program|代码|编程|snippet|调试|debug/i },
  { icon: 'DeployedCode', keys: /deployment|ci\/cd|action|pipeline|发布|部署/i },
  { icon: 'Token', keys: /api.?key|token|密钥|secret|凭证/i },
  { icon: 'Build', keys: /build|compile|构建/i },

  // 数据分析 / 报表
  { icon: 'Analytics', keys: /analytics|analysis|data.?analysis|数据分析|报表|可视化/i },
  { icon: 'BarChart', keys: /pandas|matplotlib|seaborn|numpy|chart|图表|bar/i },
  { icon: 'QueryStats', keys: /stats|统计|usage model|用量|token/i },
  { icon: 'Assessment', keys: /review|评审|audit|审计|评估/i },
  { icon: 'TrendingUp', keys: /trend|trending|趋势|指标/i },
  { icon: 'ReceiptLong', keys: /receipt|单据|日志|session.?log|会话/i },
  { icon: 'Receipt', keys: /hscode|海关|hs.?code|商品编码|贸易|wms|inbound|outbound|inventory/i },

  // 搜索 / 文档
  { icon: 'Search', keys: /search|web.?search|搜索|google|gog|查找/i },
  { icon: 'FindInPage', keys: /grep|find|scan|抓帧|查询/i },
  { icon: 'Description', keys: /doc.?writer|write.*doc|文档|写作|summary|总结|纪要|note|笔记/i },
  { icon: 'Article', keys: /article|blog|博客|公告|knowledge|知识/i },

  // 媒体 / 图像 / PDF / 白板
  { icon: 'Image', keys: /image|picture|photo|图像|gif|meme|图片|screenshot|截图/i },
  { icon: 'InsertChart', keys: /diagram|whiteboard|白板|架构图|流程图|图表生成|excalidraw/i },
  { icon: 'Draw', keys: /draw|paint|doodle|画板|绘制/i },
  { icon: 'Palette', keys: /meme.?maker|design|设计|style|样式/i },
  { icon: 'AutoAwesome', keys: /sparkles|meme|创意|sparkle|生成|generate/i },
  { icon: 'Movie', keys: /video.*frame|抽帧|video.?process|视频剪辑|movie filter|clawcam|camsnap/i },
  { icon: 'MovieFilter', keys: /movie filter|video filter|滤镜|clip|剪辑/i },
  { icon: 'Videocam' as any, keys: /camera|摄像头|rtsp|onvif/i },
  { icon: 'PhotoCamera', keys: /snapshot|photo.?cam|截图|picture.?as|照片/i },
  { icon: 'PictureAsPdf', keys: /pdf|nano.?pdf/i },
  { icon: 'ClosedCaption', keys: /whisper|transcribe|字幕|caption|语音.?文字|转写|minutes|妙记/i },
  { icon: 'Mic', keys: /tts|speech|voice.?synthesis|录音|语音|sherpa/i },
  { icon: 'Audiotrack', keys: /songsee|频谱|音频.*分析|audio.*feature|audio|音乐|audiobook|song/i },
  { icon: 'Radar', keys: /radar|spectrum|频谱|sonos.*discover|网络发现/i },

  // 音乐 / 音响 / 灯光 / 天气
  { icon: 'Speaker', keys: /sonos|blu|bluos|扬声器|音响|speaker|audio.?device/i },
  { icon: 'Lightbulb', keys: /hue|light|灯光|philips|照明|灯泡/i },
  { icon: 'MusicNote', keys: /spotify|music|音乐|player|play.*song/i },
  { icon: 'WbSunny', keys: /weather|天气|wttr|预报|降水|温度/i },
  { icon: 'LocationOn', keys: /places|地图|位置|goplaces|坐标|location/i },

  // Apple / macOS 生态
  { icon: 'StickyNote2', keys: /apple.?notes|apple note|备忘录|bear.?notes|bear note|obsidian|notion/i },
  { icon: 'StickyNote', keys: /notes?.*cli|note.?keeper|记事/i },
  { icon: 'Alarm', keys: /apple.?reminders|提醒事项|remind|闹钟|待办|things.?mac|things 3/i },
  { icon: 'TaskAlt', keys: /task.?planner|task.*flow|任务|todo|待办|待办任务|task/i },
  { icon: 'SmartButton', keys: /things.*3|things 3|待办任务.*list|待办事项/i },
  { icon: 'Password', keys: /1password|password|密码|密钥管理|secret.?manager/i },
  { icon: 'Peekaboo' as any, keys: /peekaboo|macos.*ui|ui.?autom|图形界面/i },

  // IM / 通讯 / 邮件
  { icon: 'SmartButton' as any, keys: /imsg|imessage|messages?\.app|短信|sms/i },
  { icon: 'Phone', keys: /phone|call|电话|sms|短消息/i },
  { icon: 'Email', keys: /himalaya|gmail|mail|邮件|email|inbox|gog.?workspace/i },
  { icon: 'Chat', keys: /chat|xurl|twitter|x\/|x\b/i },
  { icon: 'AltRoute', keys: /xurl|twitter.*cli|x\s|tweet|发文|发帖/i },

  // DevOps / 调试 / 终端 / 连接
  { icon: 'Terminal', keys: /terminal|shell|cli|command.?line|tmux|命令行/i },
  { icon: 'Grid3x3', keys: /tmux|会话.*窗格|pane/i },
  { icon: 'Cable', keys: /connect|node.*connect|连接诊断|qr.*code|pair|配对/i },
  { icon: 'Adjust', keys: /debug|调试|node.?inspect|pdb|debugpy|inspect.*debugger/i },
  { icon: 'Memory', keys: /memory|heap|cpu.*profile|profile|性能/i },
  { icon: 'IntegrationInstructions', keys: /mcp|mcporter|model.?context.*protocol|tool.*server|server tool/i },
  { icon: 'ExtensionOff', keys: /disable.*mcp|禁用.*插件/i },
  { icon: 'Schema', keys: /task.*flow|流程编排|作业|workflow|chain.*node|taskflow/i },
  { icon: 'AccountTree', keys: /task.*flow|依赖|计划|编排/i },
  { icon: 'Radar' as any, keys: /blogwatcher|订阅|feed|rss|atom|watch/i },

  // 安全 / 健康
  { icon: 'HealthAndSafety', keys: /health.?check|加固|security.*hardening|host.?health|安全.*加固|ssh.*audit/i },
  { icon: 'Security', keys: /security|渗透|漏洞|scan.*vuln|防护/i },
  { icon: 'BugReport', keys: /bug|缺陷|issue|crash/i },
  { icon: 'WarningAmber', keys: /warning|告警|alert|audit.?finding/i },

  // 插件 / 技能 / 市场
  { icon: 'Widgets', keys: /skill.?creator|agent.?skill|创建.*技能|skill.*md/i },
  { icon: 'Store', keys: /clawhub|skill.*market|market|插件市场|技能市场/i },
  { icon: 'Extension', keys: /plugin|extension|插件|扩展|installer/i },

  // 项目管理
  { icon: 'AppRegistration', keys: /trello|kanban|看板|board|list.*card/i },

  // 通用能力
  { icon: 'Translate', keys: /translate|翻译|localization|多语言/i },
  { icon: 'AutoFixHigh', keys: /brainstorm|头脑风暴|idea|创意|brain/i },
  { icon: 'Psychology', keys: /brain|策略|think|思考|洞察/i },
  { icon: 'SmartToy', keys: /agent|worker|coding.?agent|代理/i },
  { icon: 'Functions', keys: /function.?call|工具调用|oracle/i },
  { icon: 'Checklist', keys: /checklist|清单|check.?list|list.*check/i },
  { icon: 'Schedule', keys: /schedule|plan|排期|cron|计划.*任务|待办排期/i },
  { icon: 'Sync', keys: /sync|同步|rescan|刷新.*目录|扫描.*技能/i },
  { icon: 'Tune', keys: /settings?|配置|setting|参数/i },
  { icon: 'SettingsSuggest', keys: /config|配置|建议|优化/i },
  { icon: 'Bolt', keys: /trigger|auto|automation|自动化|快捷|fast|快捷方式/i },
  { icon: 'FactCheck', keys: /ordercli|外卖|food.*order|order.*history|订单/i },
  { icon: 'Fastfood', keys: /foodora|deliveroo|外卖|order.*food|餐饮/i },
  { icon: 'Calculate', keys: /calculate|计算|figures|数字|numbers?|财务.*计算/i },
  { icon: 'Warehouse', keys: /inventory|库存|wms|仓储|出库|入库|transfer|调拨/i },
  { icon: 'LocalShipping', keys: /outbound|出库|发货|物流|shipping|配送/i },
  { icon: 'Input', keys: /inbound|入库|收货|receiving/i },
  { icon: 'Output', keys: /outbound|出库/i },
  { icon: 'Hub', keys: /claw|hub|核心|中枢/i },
  { icon: 'Sensors', keys: /sensors|监控|watchdog|sag|监控.*状态/i },
  { icon: 'Attractions', keys: /google|google maps|attractions?|place.*detail/i },
  { icon: 'WbSunny' as any, keys: /weather/i },
];

/**
 * 根据技能内容关键词，推导一个语义化的 MUI icon name。
 * 优先使用 SKILL.md 显式声明的 entry.icon（若在 AVAILABLE_ICON_NAMES 白名单）。
 */
export function inferBuiltinSkillIcon(entry: SkillMetaInput): string {
  const explicit = entry.icon || '';
  if (explicit && ICON_WHITELIST.has(explicit)) return explicit;

  const haystack = [
    entry.id,
    entry.name || '',
    entry.description || entry.desc || '',
    entry.category || '',
    ...(entry.tags || []),
    entry.sourcePath || '',
    entry.trigger || '',
    ...(entry.triggers || []),
  ]
    .map((s) => (s || '').toString().toLowerCase())
    .join(' | ');

  for (const rule of KEYWORD_ICON_RULES) {
    if (rule.keys.test(haystack)) return rule.icon;
  }
  return 'Extension';
}

// ---------------- trigger 关键词自动推导 ----------------

// 一些技能本身在 desc/id 里含强关键词，可自动作为 trigger 提示
const TRIGGER_HINT_RULES: Array<{ keys: RegExp; hint: string }> = [
  { keys: /pdf|nano.?pdf/, hint: 'PDF / 文档编辑' },
  { keys: /1password|password/, hint: '密码 / 1Password' },
  { keys: /apple.?notes|apple note|备忘录|bear.?notes|obsidian|notion/, hint: '笔记 / 知识库' },
  { keys: /apple.?reminders|提醒事项|remind|things.?mac|things 3|待办/, hint: '提醒 / 待办' },
  { keys: /email|himalaya|gmail|mail/, hint: '邮件 / 收件箱' },
  { keys: /weather|天气|wttr|预报/, hint: '天气 / 温度' },
  { keys: /places|location|地图|位置|坐标/, hint: '地图 / 地点' },
  { keys: /translate|翻译/, hint: '翻译 / 多语言' },
  { keys: /code.?review|review|评审/, hint: '代码评审' },
  { keys: /doc.?writer|文档|写作|写.*文档/, hint: '文档写作' },
  { keys: /task.?planner|任务|todo|计划|规划/, hint: '任务规划' },
  { keys: /brainstorm|头脑风暴|创意|idea/, hint: '头脑风暴' },
  { keys: /analysis|数据分析|analytics|pandas|报表|可视化/, hint: '数据分析' },
  { keys: /web.?search|search|google|搜索/, hint: '联网搜索' },
  { keys: /wms|inventory|仓储|库存|outbound|inbound|hscode|海关|hs.?code|商品编码|贸易/, hint: 'WMS / 供应链' },
  { keys: /github|gh-|issue|pull.?request|repo/, hint: 'GitHub / 代码仓库' },
  { keys: /clawhub|技能.*市场|plugin.*market/, hint: '技能市场 / ClawHub' },
  { keys: /diagram|白板|架构图|流程图|excalidraw|draw|chart/, hint: '图表 / 白板' },
  { keys: /meme|meme.?maker/, hint: 'Meme / 表情包' },
  { keys: /gif|gifgrep/, hint: 'GIF 动图' },
  { keys: /whisper|transcribe|语音.*转写|转写|minutes|妙记/, hint: '语音转写 / 字幕' },
  { keys: /tts|speech|sherpa.*tts|voice.*synthesis|sag|elevenlabs/, hint: '语音合成 / TTS' },
  { keys: /sonos|blu|hue|音响|扬声器|灯光|spotify|音乐/, hint: '家庭影音 / 智能家居' },
  { keys: /debug|调试|pdb|debugpy|node.?inspect/, hint: '代码调试' },
  { keys: /mcp|mcporter|model.?context.*protocol/, hint: 'MCP 工具 / 服务器' },
  { keys: /skill.?creator|agent.?skill|创建.*技能/, hint: '创建技能' },
  { keys: /tmux|terminal|shell|cli/, hint: '终端 / 交互式 CLI' },
  { keys: /imsg|imessage|sms|messages?\.app/, hint: 'iMessage / SMS' },
  { keys: /xurl|twitter|tweet|发帖|发文/, hint: 'X / Twitter' },
  { keys: /trello|看板|board/, hint: 'Trello / 看板' },
  { keys: /ordercli|外卖|food.*order|foodora|deliveroo/, hint: '外卖订单' },
  { keys: /video.*frame|抽帧|video.?process|camsnap|摄像头|rtsp/, hint: '视频 / 摄像头' },
  { keys: /blogwatcher|rss|atom|订阅/, hint: '博客 / RSS 订阅' },
  { keys: /health.?check|主机.*加固|host.*health|security.*hardening|安全.*加固/, hint: '安全 / 加固' },
  { keys: /session.?log|会话.*日志|jq.*日志/, hint: '会话日志' },
  { keys: /task.?flow|编排|作业|workflow/, hint: '任务编排' },
  { keys: /node.*connect|连接诊断|配对|二维码|引导码/, hint: 'Node 连接' },
  { keys: /peekaboo|macos.*ui|ui.*autom/, hint: 'macOS UI 自动化' },
  { keys: /google.?workspace|calendar|drive|sheets|docs|contacts/, hint: 'Google Workspace' },
  { keys: /coding.?agent|codex|claude.*code|opencode/, hint: '编码代理' },
  { keys: /deploy|ci\/cd|action|pipeline/, hint: 'CI/CD 发布' },
  { keys: /oracle|二模型.*评审|token.*预检/, hint: 'Oracle 多模型' },
  { keys: /gemini|cli.*gemini|gemma/, hint: 'Gemini CLI' },
  { keys: /model.?usage|用量.*模型|cost.*codexbar|billing/, hint: '用量统计' },
];

const MAX_HINTS = 3;

/**
 * 推导「关键字提示」字符串（用于卡片右上角 🔑 黄块）。
 * 优先使用 SKILL.md 中声明的 triggers / trigger；
 * 否则按 TRIGGER_HINT_RULES 提取内容关键词（最多 3 条）。
 */
export function inferBuiltinSkillTrigger(entry: SkillMetaInput): string {
  const explicit = [
    ...(entry.triggers || []),
    ...(entry.trigger ? [entry.trigger] : []),
  ].map((s) => (s || '').trim()).filter(Boolean);
  if (explicit.length) {
    return explicit.slice(0, MAX_HINTS).join(' · ');
  }

  const haystack = [
    entry.id,
    entry.name || '',
    entry.description || entry.desc || '',
    entry.category || '',
    ...(entry.tags || []),
    entry.sourcePath || '',
  ]
    .map((s) => (s || '').toString())
    .join(' | ');

  const matched: string[] = [];
  const seen = new Set<string>();
  for (const rule of TRIGGER_HINT_RULES) {
    if (rule.keys.test(haystack) && !seen.has(rule.hint)) {
      seen.add(rule.hint);
      matched.push(rule.hint);
      if (matched.length >= MAX_HINTS) break;
    }
  }
  return matched.join(' · ');
}

// ---------------- 白名单：避免生成 MUI 没有的 icon ----------------
export const ICON_WHITELIST = new Set<string>([
  'Dashboard', 'Warehouse', 'LocalShipping', 'Inventory',
  'Input', 'Output', 'Factory', 'PrecisionManufacturing',
  'Checklist', 'FactCheck', 'QrCode', 'Route',
  'Description', 'Article', 'BarChart', 'Assessment', 'Analytics',
  'QueryStats', 'ManageSearch', 'TrendingUp', 'ReceiptLong',
  'Bolt', 'AutoMode', 'Schedule', 'Sync', 'NotificationsActive',
  'Chat', 'Forum', 'Tune', 'SettingsSuggest', 'KeyboardCommandKey',
  'SmartToy', 'Psychology', 'AutoFixHigh', 'Extension',
  'Build', 'Functions', 'Code', 'Terminal', 'Memory', 'Hub', 'Webhook',
  'Email', 'Phone',
  'WarningAmber', 'Security', 'BugReport',
  'Calculate', 'Savings', 'AccountBalance', 'RequestQuote', 'Percent', 'LocalOffer',
  'Palette', 'Image', 'MusicNote', 'VideoCamera',
  'Search', 'FindInPage', 'Draw', 'Translate', 'TaskAlt',
  'Receipt', 'PictureAsPdf', 'CloudQueue', 'LocationOn', 'WbSunny',
  'Password', 'StickyNote2', 'Alarm', 'IntegrationInstructions',
  'Source', 'BugFix', 'DeployedCode', 'Token',
  'Speaker', 'Lightbulb', 'Audiotrack', 'Mic', 'ClosedCaption',
  'InsertChart', 'AutoAwesome', 'Movie', 'Radar',
  'Cable', 'Adjust', 'AppRegistration', 'StickyNote', 'SmartButton',
  'MovieFilter', 'PhotoCamera', 'Sensors', 'AltRoute', 'Attractions', 'Fastfood',
  'Widgets', 'Store',
  'HealthAndSafety', 'ExtensionOff', 'Grid3x3', 'AccountTree', 'Schema',
]);
