# CrossWMS macOS Widget Extension

> 将仓库关键指标显示在 macOS 桌面 Widget 中（需要 macOS 14.0+）

## 架构概览

```
┌─────────────────────────────────────────────────────┐
│             主应用 (pywebview)                    │
│  ~/.crosswms/widget_data.json  ← 共享文件       │
└──────────────────────┬──────────────────────────┘
                       │ 文件读写
┌──────────────────────▼──────────────────────────┐
│         Widget Extension (.appex)                 │
│  App Group: group.com.crosswms.desktop        │
│  每 15 分钟刷新一次 Timeline                     │
└─────────────────────────────────────────────────┘
```

## 文件清单

### Widget 源码 (`macos-widget/`)
| 文件 | 说明 |
|------|------|
| `Package.swift` | Swift Package 配置，macOS 14.0+ |
| `Info.plist` | Widget Extension 配置（NSExtension） |
| `Widget.entitlements` | App Group 授权 |
| `Sources/CrossWMSWidget/Model.swift` | Codable 数据模型 |
| `Sources/CrossWMSWidget/CrossWMSWidget.swift` | Widget 入口 + Timeline Provider |
| `Sources/CrossWMSWidget/WidgetEntry.swift` | Timeline Entry（含 placeholder） |
| `Sources/CrossWMSWidget/Views/WidgetView.swift` | 主视图分发（按尺寸） |
| `Sources/CrossWMSWidget/Views/SmallWidgetView.swift` | 小尺寸（库存件数 + 进度条） |
| `Sources/CrossWMSWidget/Views/MediumWidgetView.swift` | 中尺寸（KPI 卡片 + 预警） |
| `Sources/CrossWMSWidget/Views/LargeWidgetView.swift` | 大尺寸（仓库列表 + KPI） |

### Python 数据导出
| 文件 | 说明 |
|------|------|
| `widget_exporter.py` | 导出 Widget 数据到 `~/.crosswms/widget_data.json` |
| `pywebview_app.py` (修改) | 新增 `widget_push_data` API |
| `src/stores/warehouseStore.ts` (修改) | 仓库变化时自动调用导出 |

### 构建脚本
| 文件 | 说明 |
|------|------|
| `build-widget.sh` | 构建 Widget Extension + 嵌入 .app |
| `build-dmg-pywebview.sh` (修改) | 新增第 8.5 步：自动构建 Widget |

## 数据格式

Widget 读取 `~/.crosswms/widget_data.json`，格式如下：

```json
{
  "version": 1,
  "lastUpdated": "2026-05-29T10:30:00Z",
  "timestamp": 1716978600.0,
  "totalWarehouses": 3,
  "totalUsedItems": 13700,
  "totalCapacity": 19000,
  "warningCount": 1,
  "inboundCount": 25,
  "outboundCount": 18,
  "transitCount": 12,
  "inventoryDepth": 72.1,
  "warehouses": [
    {
      "id": "WH001",
      "name": "深圳仓",
      "city": "深圳",
      "usedItems": 3200,
      "totalItems": 5000,
      "utilizationRate": 64.0,
      "status": "active",
      "inboundToday": 12,
      "outboundToday": 8
    }
  ],
  "history": [
    {"date": "2026-05-23", "utilizationRate": 70.0}
  ],
  "settings": {
    "warningThreshold": 70,
    "fullThreshold": 90,
    "refreshInterval": 15
  }
}
```

## 使用说明

### 构建 Widget Extension

```bash
cd cross-wms/
bash build-widget.sh              # 构建 + 自动嵌入到 .app
bash build-widget.sh --only-build  # 仅构建，不复制
```

### 完整构建 DMG（含 Widget）

```bash
cd cross-wms/
bash build-dmg-pywebview.sh
```

Widget 会在第 8.5 步自动构建并嵌入到 `CrossWMS.app/Contents/PlugIns/CrossWMSWidget.appex`。

### 启用 Widget

1. 安装 CrossWMS.app 到 `/Applications/`
2. 右键点击 CrossWMS.app →「显示包内容」
3. 确认 `Contents/PlugIns/CrossWMSWidget.appex` 存在
4. 打开「系统设置」→「桌面与程序坞」→「小组件」
5. 搜索 "CrossWMS"，添加到桌面

## 支持的 Widget 尺寸

| 尺寸 | 显示内容 |
|------|---------|
| **小 (2x2)** | 库存件数 + 进度条 |
| **中 (4x2)** | 库存件数 + 预警数 + 在途数 + 入库数 |
| **大 (4x3)** | KPI 卡片 + 仓库列表（最多 5 个）|

## 技术要点

- **数据同步**：主应用写入 `~/.crosswms/widget_data.json`，Widget 读取同一文件
- **App Group**：`group.com.crosswms.desktop`（需在「签名与功能」中启用）
- **Timeline 刷新**：每 15 分钟（`getTimeline` 中设置）
- **占位数据**：Widget 在未读取到数据时显示 mock 数据

## 已知限制

- 需要 macOS 14.0+（WidgetKit 桌面 Widget 的最低系统要求）
- Widget 数据刷新依赖主应用写入（主应用未运行时数据不会更新）
- 当前使用 ad-hoc 签名（分发时需换为 Developer ID 证书）
