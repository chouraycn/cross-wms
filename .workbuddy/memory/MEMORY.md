# CrossWMS 项目记忆

## 核心架构
- PyWebView + React 18 + Vite + MUI v5 + Express + SQLite 桌面应用 (CDFKnow, 基于 OpenClaw 2026.6.9 硬分叉)
- 执行策略: Legacy / Observer / Planner / ReAct(v9.0 统一 streamExecutor)
- 工具: builtin + plugin + MCP (`mcp__{server}__{tool}`); 权限 auto/confirm/high-risk 三级

## 关键约定（铁律）
- TS 严格模式，提交前 `NODE_OPTIONS=--max-old-space-size=8192 tsc --noEmit`（默认小堆 OOM exit137）；vite build 须绿
- 日志统一 `server/logger.ts`，禁裸 console.*（4 级 error/warn/info/debug）
- WKWebView 兼容: 禁 CSS @keyframes（用 inline transition）；禁 rAF（统一 setTimeout(fn,16)）
- 窗口: frameless 时前端自定义红黄绿圆点 (WindowDragBar.tsx)，**禁改其按钮逻辑和 pywebview_app.py Api**
- 构建: `bash scripts/build-dmg-pywebview.sh`（bump+GitHub Release）；`.npmrc legacy-peer-deps=true`
- DMG 验证: `grep -c "关键修复字符串" server_dist/index.cjs`

## SSE/流式稳定性（铁律）
- 8 核心事件 init/text/thinking/tool_call/permission_request/done/error/debug；非核心走 sendDebugSSE
- **error 必走 sendSSE**，否则前端卡"思考中"
- v9.0 `streamExecutor.executeChat()` 统一路径；TimerManager 管 keepAliveTimer；catch 必发 error+done
- 前端 useChat: done 处理器 cancelFrame 前同步刷新 thinkingBuffer；心跳超时 60s
- tool_calls 配对: assistant(tool_calls) 后必紧跟 tool 消息，三层防御(pendingSystem→contextTruncate重排→aiClient 400 strip+降级)

## 原生 Skill（ESM 运行时，易踩坑）
- 服务 ESM 运行，`require` 运行时未定义 → ReferenceError。双加载路径都用 import 动态加载（真实路径 skillLoader.loadSkillFromDirectory）
- `ctx.tools.run(name,args)` 走 `await import('./toolRegistry.js')`（禁改 require）
- 生产验证必须走 initSkillRuntime() 启动路径（非 scanDirectory 假路径）

## 数字员工执行集成 (StaffDeck×真实引擎)
- 工具闭环: HTTP + 全局MCP + 员工隔离MCP(`sd_mcp_servers`) + 原生skill + 通用技能物化(`sd_general_skills`)
- **round-trip 铁律**: 物化 def.id 必须用横线 `staff-${tenant}-${slug}`；`skillDefinitionToToolDef` 把 `-`→`_` 生成工具名，`handleSkillToolCall` 把 `_`→`-` 还原。slug 含横线时下划线错位 → 报"未找到"（e2e/api/staff-dispatch 钉死）
- 执行装配: staffChatExecutor 注入 staffMcpManager/extraSkills/extraSkillExecutor，finally disconnectAll；executionMode=REACT
- 前端执行链路状态单一来源: GET /api/staffdeck/execution-runtime?tenant_id= (server/routes/staff/executionRuntime.ts)
- 后端真实登录: POST /api/staffdeck/auth/login → {code,data:{access_token,user}}；桌面端默认会话独立 (getEnterpriseAuthSession/setEnterpriseAuthSession)

## StaffDeck 资产 100% 迁移（2026-07-28 完成）
- 图片全量拷贝: src/assets/staffdeck/(26 PNG + cot-icons/8) + src/assets/icons/(49 SVG) + 根 LOGO.svg/onboarding-*.png/public/(favicon/staffdeck-icon)
- 中央引用索引: src/assets/staffdeck-assets.ts（staffdeckContent 29 + staffdeckIcons 57 全 import，保证进 bundle）
- 样式全量移植: src/styles/staffdeck-source.css（v4→v3：去@import/@theme→:root/@apply→纯CSS/body→.sd-root/@layer base 解包；含 Semantic UI 段）
- 页级接线已完成: ① employee.ts 8 角色头像(PRESET_AVATAR_IMAGES) ② LoginPage loginPreview ③ 待补: OpenPlatformPage(plaza-*)/WorkRecordTab(capability-*)/EmployeeGalleryPage(sd1-*)/TutorialPage(onboarding-*)/BrandLogo(logo-mark)/chat(CoT cot-icons)

## Staff 前端 MUI 化迁移（2026-07-25 启动）
- 范围: 92 staff .tsx Tailwind→MUI sx/组件；276 硬编码文案→主程序 i18n
- 品牌色并入主程序靛蓝 #1a237e（不保留 teal/近黑）
- 单一来源 `src/components/staff/lib/staffTokens.ts`（SxProps<Theme>，映射到 MUI 主题）；消费者 `sx={staffTokens.xxx}`
- wrapper 集中模式: 菜单(dropdown-menu)+Select(select) 样式已内聚；批进度详见 2026-07-28.md
- 关键模式: spread SxProps 联合类型进 Box.sx → 数组+"as SxProps"收口；SystemStyleObject 此版本(v5.15.15)不导出

## e2e 测试
- API: `npm run test:e2e:api` (vitest.config.e2e.ts)，staff-* 9 套件 48 用例全绿
- 关键缝: staff-chat-execution-seam(真跑集成缝)、staff-chat-turn(SSE 协议/done 末事件)
- 前端 Playwright: tests/staff-chat.spec.ts（本机无 Chromium 未实跑，CI 可用）
- 详进度见 2026-07-28.md

## 详细修复历史
- 见 `.workbuddy/memory/YYYY-MM-DD.md` 每日工作日志
