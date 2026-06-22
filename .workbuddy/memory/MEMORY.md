# CrossWMS 项目记忆

## 核心架构
- PyWebView + React + Vite + MUI + Express + SQLite 桌面应用
- 4 种执行策略: Legacy / Observer / Planner / ReAct
- 工具系统: builtin + plugin + MCP，格式 `mcp__{server}__{tool}`
- 权限系统: auto/confirm/high-risk 三级

## 关键约定
- TypeScript 严格模式，tsc --noEmit 零错误才可提交
- 构建脚本: `bash scripts/build-dmg-pywebview.sh`（自动 bump + GitHub Release）
- `.npmrc`: `legacy-peer-deps=true`；CI 构建: `--ci --no-bump`
- 构建依赖: Python 3.14.3 + Pillow + pywebview + pyobjc-framework-Cocoa
- 日志: `server/logger.ts` 统一，禁止裸 console.*，4 级 error/warn/info/debug
- WKWebView 兼容: 不用 CSS @keyframes，用 inline transition；不用 rAF，统一 setTimeout(fn,16)
- SSE 事件 15+ 种，前端 useChat.ts 集中处理
- DMG 验证: `grep -c "关键修复字符串" server_dist/index.cjs`

## SSE 稳定性要点 (v1.5.206~209)
- `chatService.ts` 有两条路径: `handleChat`(主) 和 `executeFromQueue`(队列)，心跳/清理逻辑必须对齐
- `keepAliveTimer` 在 try 外声明，catch 中 clearInterval；降级路径必须重启 timer
- 所有 `res.write()` 必须用 `safeWrite()` 包裹（检查 writableEnded + try-catch）
- 所有 catch 块必须发 `error + done` 事件；外层 catch 用 try-catch 包裹 res.write()
- 前端心跳超时 60s；重试时重置 thinkingDone = false
- **教训**: SSE 回调无保护 → 连接断开崩溃 → done 丢失 → 卡在思考中

## tool_calls 消息配对 (v1.5.207~208)
- OpenAI 要求: `assistant(tool_calls)` 后必须紧跟对应 `tool` 消息，中间不能有 system/user
- 三层防御: reactExecutor pendingSystemMessages → contextTruncate Pass 3.5 重排序 → aiClient 400 strip+降级
- sanitizeToolMessages: Pass 0~4 多层安全网 + validateToolMessages 发送前硬校验
- 400 重试失败返回降级响应（不 throw），同时 strip reasoning_content

## 窗口控制 (v1.5.166+)
- frameless=True 时 pywebview 无系统按钮，前端自定义红黄绿圆点 (WindowDragBar.tsx)
- 拖拽: CSS `-webkit-app-region:drag`；按钮调 `pywebview.api`
- **禁止修改** WindowDragBar.tsx 按钮逻辑和 pywebview_app.py 的 Api 方法

## WKWebView 缓存 (v1.5.199+)
- pywebview 本地 HTTP 服务器必须设 no-cache headers
- 清除: `rm -rf ~/Library/Caches/com.cdf.knowclow.desktop/WebKit/NetworkCache/`

## 打包注意 (v1.5.201+)
- fsevents: `npm install --ignore-scripts`，手动为 better-sqlite3 运行 prebuild-install
- 模型加载优化: `loadModelsConfig({ skipKeyInjection: true })` 跳过 Keychain，缓存 TTL 30s

## 向量记忆 v8.6
- sqlite-vec + ONNX (all-MiniLM-L6-v2, 384维)，模型下载到 `~/.cdf-know-clow/models/`
- embedText LRU 256 条缓存；embedBatch 真批量推理
- 降级为 LIKE 关键词搜索；extractKeywords() 中英文停用词表

## 详细修复历史
- 见 `.workbuddy/memory/YYYY-MM-DD.md` 每日工作日志
