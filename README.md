# CDF Know Clow — 中免CLow端系统桌面应用

> macOS 原生桌面应用，pywebview + React 18 + TypeScript + MUI v5 + Tailwind CSS

## 功能概览

| 模块 | 说明 |
|------|------|
| 仪表盘 | 5 KPI 卡片（含库存深度、总件数）+ 仓库出货热力图 + 容积率趋势图 + 在途状态分布 |
| 仓库管理 | 仓库 CRUD + 容积率（件数基准）+ 仓库切换器 |
| 在途管理 | 运单时间轴 + 状态追踪 |
| 库存管理 | SKU 列表 + 库龄预警 |
| 腾讯文档 | API 读取 + 本地 Markdown/表格渲染 + 在线数据录入 |
| 统计报表 | 数据可视化 + CSV 导出 |
| AI 助手 | CodeBuddy SDK 集成 + TopBar 聊天输入 + 消息历史 |
| 定时任务 | 自动化任务管理 |
| 系统设置 | 腾讯文档 OAuth / 仪表盘参数 / 指标控制 / 模型管理 / 关于 |

## 技术栈

- **前端**: Vite + React 18 + TypeScript + MUI v5 + Tailwind CSS + Recharts
- **桌面**: Python pywebview (WKWebView 原生窗口)
- **AI 后端**: Express + `@tencent-ai/agent-sdk`
- **数据持久化**: localStorage (`crosswms-warehouses`, `crosswms-settings`)
- **打包**: PyInstaller → macOS DMG (arm64)

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式（前端 + AI 后端同时启动）
npm run dev

# 仅前端
npx vite

# 仅后端
npm run server

# 生产构建
npm run build
```

访问 http://localhost:5173

## 项目结构

```
cross-wms/
├── src/
│   ├── components/
│   │   ├── Dashboard/          # 仪表盘组件（KPI、热力图、图表）
│   │   ├── Layout/             # 布局（Sidebar、TopBarChatInput）
│   │   ├── Settings/           # 设置弹窗
│   │   ├── TencentDocs/        # 腾讯文档面板
│   │   ├── AIAssistant/        # AI 助手组件
│   │   └── CrossWmsChat/       # 聊天组件
│   ├── contexts/               # AppSettingsContext、UpdateContext
│   ├── pages/                   # 页面路由
│   ├── services/                # API 服务（腾讯文档、企业微信、更新检测）
│   ├── stores/                  # warehouseStore（全局仓库状态）
│   ├── types/                   # TypeScript 类型
│   └── utils/                   # volumeCalculator 等工具
├── server/                      # Express + CodeBuddy SDK 后端
├── pywebview_app.py             # pywebview 桌面启动脚本
├── build-dmg-pywebview.sh       # DMG 构建脚本
└── docs/                        # 设计文档（PRD、系统设计）
```

## 桌面应用打包

```bash
# 构建前端
npm run build

# 构建 DMG（一键脚本）
bash build-dmg-pywebview.sh
```

产物: `release/CrossWMS-{version}-mac.dmg`

### pywebview 特性

- **frameless=False**: 保留系统原生标题栏 + 红黄绿按钮
- **红绿灯位置调整**: 通过 Cocoa API + 设置页 UI 微调 X/Y 偏移
- **JS API 桥接**: `window.pywebview.api.*`（自动更新检测、CSV 下载、浏览器打开）
- **CSS 变量注入**: Python 端注入 `--pw-top: 28px` 适配系统标题栏

## 数据源模式

仪表盘支持 3 种数据源（设置 → 仪表盘参数 → 数据源模式）：

| 模式 | 说明 |
|------|------|
| `mock` | 内置 mock 数据（默认） |
| `api` | 外部 REST API |
| `tencent-docs` | 腾讯文档 API 读取 |

## 版本历史

| 版本 | 日期 | 关键变更 |
|------|------|---------|
| v1.0.47 | 2026-05-31 | DMG 闪退修复 + 红黄绿按钮位置调整 |
| v1.0.42 | 2026-05-31 | CrossWmsChat 重命名 + 对话框功能完善 |
| v1.0.37 | 2026-05-31 | ProWeb 风格 Banner + 侧边栏对齐 |
| v1.0.21 | 2026-05-29 | CSV 导出 + 热力图修复 |
| v1.0.4 | 2026-05-27 | 自动更新机制 + 版本号统一管理 |

## License

Private
