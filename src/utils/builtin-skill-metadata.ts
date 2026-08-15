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
// 上层优先：id/name 精确匹配 → 分类/业务语义 → 泛用关键词
const KEYWORD_ICON_RULES: Array<{ icon: string; keys: RegExp }> = [
  // ===== 1. ID / NAME 精确匹配：内置技能 id 强绑定 =====
  // 仓储 / WMS 核心
  { icon: 'Warehouse', keys: /\b(wms-core|wms-helper|wms-inventory|inventory-sync|warehouse-manager|库存|仓储管理)\b/i },
  { icon: 'Input', keys: /\b(inbound|inbound-plan|receipt-sync|asn|收货|入库单|wms-receive)\b/i },
  { icon: 'Output', keys: /\b(outbound|wave|picking|packing|shipping|发货|出库|波次|拣货|打包)\b/i },
  { icon: 'Inventory', keys: /\b(count-stock|stocktake|盘点|inv-check|stock-count|cycle.?count)\b/i },
  { icon: 'LocalShipping', keys: /\b(logistics|delivery|dispatch|3pl|物流|配送|运输|shipping-plan|追踪|tracking)\b/i },
  { icon: 'Route', keys: /\b(pathfinder|route.?opt|路线|路径规划|最优路径|routing)\b/i },
  { icon: 'AccountTree', keys: /\b(transfer|move-order|调拨|移库|库内|movement|bin.?move)\b/i },

  // 海关 / 贸易 / 报关
  { icon: 'Receipt', keys: /\b(hscode|hs-code|commodity-code|customs|declaration|报关|商品归类|税号|hs.?归类)\b/i },
  { icon: 'RequestQuote', keys: /\b(quote|pricing|quotation|询价|报价|pricing.?calc)\b/i },
  { icon: 'AccountBalance', keys: /\b(payment|reconciliation|settle|对账|结算|应收|应付|ar-ap)\b/i },
  { icon: 'Percent', keys: /\b(tax|duty|vat|税率|关税|税务|tax-calc)\b/i },
  { icon: 'Savings', keys: /\b(cost|costing|成本|降本|saving)\b/i },
  { icon: 'LocalOffer', keys: /\b(promo|discount|promotion|促销|优惠|coupon)\b/i },

  // 单据 / 审批
  { icon: 'FactCheck', keys: /\b(approval|approve|review-order|审批|单据审核|audit.?order)\b/i },
  { icon: 'Description', keys: /\b(order-note|remark|单据说明|doc.?template|文档模板)\b/i },
  { icon: 'ReceiptLong', keys: /\b(session.?log|audit.?trail|操作日志|会话记录|journallog)\b/i },
  { icon: 'Assessment', keys: /\b(sop|sop.?gen|流程梳理|标准作业|procedure|checklist.?gen)\b/i },

  // 看板 / 报表 / 分析
  { icon: 'Dashboard', keys: /\b(dashboard|kpi|概览|总览|kpi-board|status.?board)\b/i },
  { icon: 'BarChart', keys: /\b(bar-report|chart-gen|报表生成|excel-report|报表助手)\b/i },
  { icon: 'Analytics', keys: /\b(data.?analysis|analyst.?assist|分析助手|insight|trend-assist)\b/i },
  { icon: 'QueryStats', keys: /\b(model.?usage|用量|billing|账单|计费|usage.?track)\b/i },
  { icon: 'TrendingUp', keys: /\b(sales.?trend|growth|趋势分析|库存.?周转)\b/i },

  // 制造 / 生产
  { icon: 'Factory', keys: /\b(production|mrp|bom|生产计划|工单|manufacture|work.?order|计划员)\b/i },
  { icon: 'PrecisionManufacturing', keys: /\b(qc|quality|inspection|质检|质量|品质|qa|缺陷检测)\b/i },
  { icon: 'Build', keys: /\b(build-list|compile.?report|构建|报表编译|build.?pipeline)\b/i },

  // 识别 / 设备 / 采集
  { icon: 'QrCode', keys: /\b(qrcode|qr|barcode|条码|识别|scan.?code|扫码|pda)\b/i },
  { icon: 'Sensors', keys: /\b(iot|sensor.?gateway|监控|设备.?监控|watchdog|sag.?watch)\b/i },
  { icon: 'Radar' as any, keys: /\b(rfid|rfid.?gate|rfidreader|识别门|阅读器)\b/i },
  { icon: 'Cable', keys: /\b(node.?connect|pairable|设备配对|连接诊断|node.?status)\b/i },

  // GitHub / 代码仓库 / 评审
  { icon: 'Source', keys: /\b(gh-|github|pr.?assist|pull.?request|repo.?tool|git.?ops|source.?sync|repo.?doctor|check.?ci|ci.?status)\b/i },
  { icon: 'BugFix', keys: /\b(gh-issues|bug.?fix|review|code.?review|issue.?fix|bug.?hunt|fix.?assist)\b/i },
  { icon: 'Code', keys: /\b(coding.?assist|snippet.?library|codex|opencode|代码助手|编程助手|debug.?assist|fixme|sherpa.?code)\b/i },
  { icon: 'DeployedCode', keys: /\b(deploy|ci\/cd|action|pipeline|发布|部署|release.?assist)\b/i },
  { icon: 'Token', keys: /\b(api.?key|token.?rotate|密钥|secret|credential.?manager|access.?key)\b/i },
  { icon: 'Build', keys: /build|compile|构建/ },

  // 搜索 / 文档 / 知识
  { icon: 'Search', keys: /\b(web.?search|internet.?search|联网搜索|搜索助手|gog.?search|googlesearch|grep.?assist|global.?search)\b/i },
  { icon: 'ManageSearch', keys: /\b(doc.?search|knowledge.?base|知识库|知识库助手|文献检索|kb.?search)\b/i },
  { icon: 'FindInPage', keys: /\b(grep|find.?in|scan.?files|抓帧|查询|全文|local.?search)\b/i },
  { icon: 'Description', keys: /\b(doc.?writer|write.?doc|文档生成|写作助手|写文档|summary.?pro|纪要|会议纪要|总结.?pro|reporter|报告助手)\b/i },
  { icon: 'Article', keys: /\b(article.?gen|blog.?writer|博客|公告|knowledge.?article|公众号|软文)\b/i },
  { icon: 'Schema', keys: /\b(excel.?assist|sheet.?helper|表格|excel|公式)\b/i },

  // 媒体 / 图像 / PDF / 白板
  { icon: 'Image', keys: /\b(image.?tool|picture.?assist|图像处理|pics.?tool|screenshot.?pro|图片助手|抠图|ocr|gif.?maker|meme.?img)\b/i },
  { icon: 'PhotoCamera', keys: /\b(snapshot|photo.?cam|camsnap|截图.?pro|照片|camera.?roll|screencapture)\b/i },
  { icon: 'InsertChart', keys: /\b(diagram.?pro|whiteboard|白板|架构图|流程图|excalidraw|diagram.?gen|plantuml|mermaid|图表生成)\b/i },
  { icon: 'Draw', keys: /\b(draw.?assist|paint|doodle|画板|绘图|sketchbook)\b/i },
  { icon: 'Palette', keys: /\b(meme.?maker|design.?assist|样式设计|主题|style.?helper|ui.?design)\b/i },
  { icon: 'AutoAwesome', keys: /\b(sparkles|meme.?gen|创意生成|creative.?assist|dalle|image.?gen|生成式|海报)\b/i },
  { icon: 'Movie', keys: /\b(video.?frame|视频抽帧|video.?process|clawcam|监控画面|video.?summarize|video.?analyzer)\b/i },
  { icon: 'MovieFilter', keys: /\b(video.?filter|滤镜|clip|剪辑|video.?editor|ffmpeg.?assist)\b/i },
  { icon: 'Videocam' as any, keys: /\b(rtsp|onvif|camera.?live|摄像头|cam.?stream|录像|回放)\b/i },
  { icon: 'PictureAsPdf', keys: /\b(pdf.?assist|nano.?pdf|pdf.?tool|pdf.?split|pdf.?merge|PDF助手)\b/i },
  { icon: 'ClosedCaption', keys: /\b(whisper|transcribe|语音转文字|字幕助手|minutes.?tool|妙记助手|subtitles)\b/i },
  { icon: 'Mic', keys: /\b(tts|speech|voice.?synthesis|录音助手|语音|sherpa.?tts|elevenlabs|语音助手)\b/i },
  { icon: 'Audiotrack', keys: /\b(songsee|音频分析|audio.?feature|audiobook.?tool|音频处理|song.?info|音乐识别)\b/i },
  { icon: 'Radar' as any, keys: /\b(sonos.?discover|网络发现|spectrum|频谱|device.?scan|局域网扫描)\b/i },

  // 音乐 / 音响 / 灯光 / 天气
  { icon: 'Speaker', keys: /\b(sonos|blu|bluos|扬声器|音响|audio.?cast|airplay.?cast)\b/i },
  { icon: 'Lightbulb', keys: /\b(hue|philips.?hue|灯光助手|照明|light.?scene|灯泡控制|智能灯)\b/i },
  { icon: 'MusicNote', keys: /\b(spotify|apple.?music|音乐助手|播放列表|playlist|song.?queue|shuffle|music.?player)\b/i },
  { icon: 'WbSunny', keys: /\b(weather.?assist|wttr|天气预报|降水|温度|气象|穿衣指数)\b/i },
  { icon: 'LocationOn', keys: /\b(places|地图助手|位置|goplaces|坐标|location.?lookup|nearby)\b/i },

  // Apple / macOS 生态
  { icon: 'StickyNote2', keys: /\b(apple.?notes|apple note|备忘录助手|bear.?notes|obsidian.*tool|notion.*agent|notion.?read|笔记.?tool)\b/i },
  { icon: 'StickyNote', keys: /\b(notes?.*cli|note.?keeper|记事助手|note.?search)\b/i },
  { icon: 'Alarm', keys: /\b(apple.?reminders|提醒事项|remind.?assist|闹钟|things 3|things.?mac|待办提醒|reminder.*pro)\b/i },
  { icon: 'TaskAlt', keys: /\b(task.?planner|todo.?assist|任务规划|待办助手|任务助手|gtd|agenda.?pro)\b/i },
  { icon: 'SmartButton', keys: /\b(things.*3|things.*cli|待办列表|待办事项|inbox.?zero|capture.?tool)\b/i },
  { icon: 'Password', keys: /\b(1password|password.?manager|密码管家|secret.?manager|vault|pwgen)\b/i },
  { icon: 'Adjust' as any, keys: /\b(peekaboo|macos.?ui|ui.?autom|ui.?automation|界面自动化|mac.?control|applescript)\b/i },

  // IM / 通讯 / 邮件
  { icon: 'SmartButton' as any, keys: /\b(imsg|imessage|messages?\.app|短信|sms|蓝色气泡|green.*bubble)\b/i },
  { icon: 'Phone', keys: /\b(phone.?assist|call|telephone|电话|短消息|voip|call.?log)\b/i },
  { icon: 'Email', keys: /\b(himalaya|gmail.*tool|mail.?assist|邮件助手|收件箱|inbox.?zero|gog.?workspace|outlook.*tool|sendmail)\b/i },
  { icon: 'Chat', keys: /\b(chat.?assist|slack.*tool|discord|teams|wecom|wework|群聊|消息助手)\b/i },
  { icon: 'AltRoute', keys: /\b(xurl|twitter.*assist|tweet|发文|发帖|x.*tool|社媒发布)\b/i },
  { icon: 'Forum', keys: /\b(discourse|discuss|论坛|faq|问答助手)\b/i },

  // DevOps / 调试 / 终端 / 连接
  { icon: 'Terminal', keys: /\b(terminal|shell.?tool|cli.?assist|command.?line|tmux|命令行|zsh.*profile|bash.?tool|shellcheck)\b/i },
  { icon: 'Grid3x3', keys: /\b(tmux|会话.?窗格|pane.?manager|窗口管理|workspace.?layout)\b/i },
  { icon: 'Cable', keys: /\b(connect|node.?connect|连接诊断|pair|配对|tunnel|ssh.*config|远程连接)\b/i },
  { icon: 'Adjust', keys: /\b(debug|调试|pdb|debugpy|node.?inspect|inspector|troubleshoot|bug.?trace)\b/i },
  { icon: 'Memory', keys: /\b(memory|heap.?dump|cpu.*profile|profiler|性能|perf.?assist)\b/i },
  { icon: 'IntegrationInstructions', keys: /\b(mcp|mcporter|model.?context.?protocol|tool.?server|server.?tool|mcp.*client|bridge.*tool)\b/i },
  { icon: 'ExtensionOff', keys: /\b(disable.*mcp|禁用.*插件|plugin.?disable|capability.?off)\b/i },
  { icon: 'Schema', keys: /\b(task.?flow|编排|作业|workflow|chain.?node|taskflow|dag.*tool|flow.?helper)\b/i },
  { icon: 'AccountTree', keys: /\b(task.?flow|依赖|计划|项目.?结构|模块关系|hierarchy)\b/i },
  { icon: 'Radar' as any, keys: /\b(blogwatcher|rss|atom|订阅助手|feed.?reader|watch.?update)\b/i },

  // 安全 / 健康
  { icon: 'HealthAndSafety', keys: /\b(health.?check|host.?hardening|security.?hardening|安全.?加固|ssh.?audit|主机加固|系统加固)\b/i },
  { icon: 'Security', keys: /\b(security|渗透|vulnerability|漏洞扫描|防护|fw.?config|firewall)\b/i },
  { icon: 'BugReport', keys: /\b(bug|缺陷|issue|crash.?analysis|故障报告|崩溃分析|异常分析)\b/i },
  { icon: 'WarningAmber', keys: /\b(warning|告警|alert|audit.?finding|异常告警|警报助手)\b/i },

  // 插件 / 技能 / 市场
  { icon: 'Widgets', keys: /\b(skill.?creator|agent.?skill|创建.*技能|skill.?md.*assist|skill.?scaffold|技能开发)\b/i },
  { icon: 'Store', keys: /\b(clawhub|skill.*market|marketplace|插件市场|技能市场|技能广场|skillstore)\b/i },
  { icon: 'Extension', keys: /\b(plugin|extension.*tool|插件|扩展|installer|插件安装器)\b/i },

  // 项目管理
  { icon: 'AppRegistration', keys: /\b(trello|kanban|看板助手|board|list.?card|card.?wall|project.?board)\b/i },

  // 通用能力
  { icon: 'Translate', keys: /\b(translate|翻译助手|localization|多语言|i18n|译员助手|翻译校对)\b/i },
  { icon: 'AutoFixHigh', keys: /\b(brainstorm|头脑风暴|idea|创意助手|brain.?assist|发散思考|ideation)\b/i },
  { icon: 'Psychology', keys: /\b(brain.?strategist|策略|think|思考助手|洞察|root.?cause|策略助手)\b/i },
  { icon: 'SmartToy', keys: /\b(agent|worker|coding.?agent|代理|agent.?orchestrator|多代理|worker.?pool)\b/i },
  { icon: 'Functions', keys: /\b(function.?call|工具调用|oracle|tool.?router|工具路由)\b/i },
  { icon: 'Checklist', keys: /\b(checklist|清单|check.?list|list.?check|自查表|自检|qa.?check|复核)\b/i },
  { icon: 'Schedule', keys: /\b(schedule|计划|排期|cron|排程|待办排期|calendar.*sync|日程助手)\b/i },
  { icon: 'Sync', keys: /\b(sync|同步|rescan|目录刷新|目录扫描|技能刷新|sync.?data|双向同步)\b/i },
  { icon: 'Tune', keys: /\b(settings?|配置|setting|参数|偏好设置|config.?assist)\b/i },
  { icon: 'SettingsSuggest', keys: /\b(config.?tune|配置建议|优化建议|性能.?调优|tuning)\b/i },
  { icon: 'Bolt', keys: /\b(trigger|automation|自动化|快捷方式|hotkey|quick.?action|快捷|一键)\b/i },
  { icon: 'NotificationsActive', keys: /\b(notify|notification|notify.?me|提醒助手|推送|消息提醒|alert.?notify)\b/i },
  { icon: 'FactCheck', keys: /\b(ordercli|外卖|food.*order|order.*history|订单助手|订单查询|订单追踪)\b/i },
  { icon: 'Fastfood', keys: /\b(foodora|deliveroo|餐饮订单|meal|订餐|lunch|order.?food)\b/i },
  { icon: 'Calculate', keys: /\b(calculate|计算|figures|数值计算|calculator|calc.?assist|成本计算|核算)\b/i },
  { icon: 'Warehouse', keys: /inventory|库存|wms|仓储|transfer|调拨/ },
  { icon: 'LocalShipping', keys: /outbound|出库|发货|物流|shipping|配送/ },
  { icon: 'Input', keys: /inbound|入库|收货|receiving/ },
  { icon: 'Output', keys: /outbound|出库/ },
  { icon: 'Hub', keys: /claw|hub|核心|中枢|clawhub|platform.?hub/ },
  { icon: 'Sensors', keys: /sensors|监控|watchdog|sag|监控.*状态|状态监控/ },
  { icon: 'Attractions', keys: /google|google maps|attractions?|place.*detail|景点|探店/ },
  { icon: 'WbSunny' as any, keys: /weather/ },
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
