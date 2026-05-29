CrossWMS v1.0.14 发布说明：

### v1.0.14（2026-05-28）
- 修复：HTTP 服务器改用固定端口（9988），确保 pywebview WKWebView 的 localStorage origin 一致，解决每次重启仓库数据丢失的问题
- 修复：UpdateContext 优先读取 pywebview Python 侧版本号（`get_version()`），避免 Vite 注入值与实际打包版本不一致导致更新误报

### v1.0.13（2026-05-28）
- 修复：热力图鼠标滑入抖动问题（移除 SVG transform，改用 stroke + drop-shadow）
- 优化：热力图 hover 高亮效果

### v1.0.12（2026-05-28）
- 修复：仪表盘 KPI 卡片指标溢出
- 优化：UI 细节调整

### v1.0.11（2026-05-27）
- 优化：仓库热力图配色方案
- 修复：热力图显示逻辑

### v1.0.10（2026-05-27）
- 优化：侧边栏加载速度
- 修复：路由切换时的状态保持

### v1.0.9（2026-05-27）
- 新增：仓库数量超限提示
- 修复：仪表盘空状态引导页面

### v1.0.8（2026-05-27）
- 修复：pywebview HTTP 服务器端口冲突
- 优化：构建流程稳定性

### v1.0.7（2026-05-27）
- 修复：DMG 应用图标显示
- 优化：Info.plist 配置

### v1.0.6（2026-05-27）
- 修复：pywebview 构建时 version.txt 打包问题
- 优化：构建脚本稳定性

### v1.0.5（2026-05-27）
- 修复构建脚本中 Release API 创建的 Python 引号嵌套问题
- 恢复 GITHUB_TOKEN API 上传的稳定性

### v1.0.4（2026-05-27）
- 修复 pywebview 环境中自动更新检测功能（CORS 跨域限制导致 fetch GitHub API 失败）
- pywebview JS API 桥接：Python 端注入 `get_release_info()` 方法
- JS 端双层检测：优先 `window.pywebview.api.get_release_info()`，降级 `fetch()`
- 腾讯文档 API 适配 pywebview 桥接
- 构建脚本修复：curl / gh CLI 上传状态码验证，避免误报发布成功
- 重建 DMG（108MB），已推送 git tag v1.0.4

### v1.0.3（2026-05-26）
- 新增 AI 助手（CodeBuddy SDK）
- 新增设置按钮 WorkBuddy 风格 Popover
- 移除自定义 TrafficLights 组件，恢复系统原生红绿灯
- 仓库热力图支持 3 种配色 + 时间范围配置
- pywebview frameless 模式 + CSS 变量注入方案
- DMG 大小降至 107MB
- 已推送 git tag v1.0.3

### v1.0.2（2026-05-26）
- 统一版本号管理，构建时自动同步所有组件的版本号
- DMG 文件名自动匹配版本号（CrossWMS-{version}-mac.dmg）
- 新增版本 bump 命令
- 设置页"关于"区域新增自动更新检查功能
