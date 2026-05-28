CrossWMS v1.0.5 发布说明：

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
