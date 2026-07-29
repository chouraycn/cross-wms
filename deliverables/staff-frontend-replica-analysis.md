# 数字员工前端复刻差异分析报告

> 分析时间: 2026-07-29
> 参考项目: `/StaffDeck-main/frontend-enterprise/`
> 当前实现: `/src/pages/staff/` + `/src/components/staff/`

---

## 一、核心结论

**当前数字员工前端展现"还是老的"，根本原因是三套颜色体系并行运行，CSS 变量虽已正确定义但几乎未被消费。**

| 维度 | 参考项目 StaffDeck-main | 当前 CrossWMS 实现 | 差异 |
|------|------------------------|-------------------|------|
| 主色调 | Teal `#0f766e` | 近黑 `#18181a` / 深灰 `#111827` | **完全不同** |
| 正文字色 | 暖深棕 `#20201d` | 冷蓝灰 `#464c5e` | **色温相反** |
| 边框色 | 暖米色 `#ded7cc` | 冷蓝灰 `#e3e7f1` | **色温相反** |
| 背景色 | 暖米色 `#f7f5ef` | 暖米色 `#f7f5ef` | 一致 |
| 侧边栏 active | `#f6f6f6` + `#18181a` | `#eef1fb` + `#3a4fbf` (蓝紫) | **完全不同** |
| CSS 变量消费 | 全局通过 Tailwind utility | 仅 2 个组件文件引用 | **~2% 消费率** |
| 硬编码色值 | 0 (全部走 CSS 变量) | 49 文件 ×750+ 处 | **全面硬编码** |

---

## 二、三套颜色体系详解

### 体系 1: staffdeck.css (CSS 变量层) — 已定义，几乎未被消费

文件: `src/styles/staffdeck.css`

变量值与参考项目 100% 对齐：
```css
--primary: #0f766e;          /* Teal 主色 */
--background: #f7f5ef;       /* 暖米色背景 */
--foreground: #20201d;       /* 暖深棕文字 */
--border: #ded7cc;           /* 暖米色边框 */
--accent: #0f766e;            /* Teal 强调 */
```

**问题**: 搜索 `var(--primary)` / `var(--accent)` / `var(--foreground)` / `var(--border)` 在整个 `src/` 中仅命中 **5 个文件**，其中 3 个是 CSS 定义文件自身，只有 `EmployeeAvatarEditor.tsx`、`button.tsx`、`sonner.tsx` 3 个组件实际消费了 CSS 变量。

**消费率: ~2%**（3/65+ 组件文件）

### 体系 2: enterprise-ui.ts (硬编码 Tailwind 类) — 49 文件 ×750+ 处

文件: `src/components/staff/lib/enterprise-ui.ts`

```typescript
// 当前硬编码（冷蓝灰色系）
export const MENU_ITEM_CLASS =
  'text-[#858b9c] focus:text-[#18181a]'           // 应为 text-[#6d726e] focus:text-[#20201d]

export const SELECT_TRIGGER_CLASS =
  'border-[#e3e7f1] text-[#464c5e]'                // 应为 border-[#ded7cc] text-[#20201d]

export const DIALOG_PRIMARY_BUTTON_CLASS =
  'bg-[#18181a] hover:bg-[#303030]'                // 应为 bg-[#0f766e] hover:bg-[#0d6358]

export const SEARCH_COMBO_BUTTON_CLASS =
  'bg-[#18181a] hover:bg-[#303030]'                // 应为 bg-[#0f766e]

export const OUTLINE_ACTION_BUTTON_CLASS =
  'border-[#e3e7f1] text-[#757f9c]'                // 应为 border-[#ded7cc] text-[#6d726e]
```

这组色值是一套**冷蓝灰色系**（`#464c5e` / `#e3e7f1` / `#18181a` / `#858b9c` / `#757f9c`），与参考项目的**暖米色系**（`#20201d` / `#ded7cc` / `#0f766e` / `#6d726e`）完全不同。

### 体系 3: staffTokens.ts (MUI Token 映射) — 未对齐 Teal

文件: `src/components/staff/lib/staffTokens.ts`

```typescript
// 当前映射到 MUI primary.main
searchComboButton: {
  bgcolor: 'primary.main',  // = #111827 (默认深灰) ≠ #0f766e (Teal)
}
dialogPrimaryButton: {
  bgcolor: 'primary.main',  // = #111827 ≠ #0f766e
}
```

`primary.main` 来自 `App.tsx` 的 `buildTheme()` → `ACCENT_MAP.default.main = '#111827'`，**不是** Teal `#0f766e`。用户切换 accent 颜色时还会进一步变化，完全不固定。

---

## 三、StaffLayout 侧边栏差异

### 当前实现 (StaffLayout.tsx 第 130-175 行)

```tsx
// active 状态 — 蓝紫色，参考项目中不存在
active
  ? { bgcolor: '#eef1fb', color: '#3a4fbf', fontWeight: 500 }
  : { color: '#464c5e', '&:hover': { bgcolor: '#f6f6f6' } }

// 侧边栏容器
borderColor: '#e3e7f1'   // 应为 #f4f4f4 (--sidebar-border)
bgcolor: '#fbfbf9'       // 应为 #ffffff (--sidebar)

// 分区标题
color: '#9aa0b5'         // 应为 #858b9c (--sidebar-foreground)

// 顶部用户条
borderColor: '#e3e7f1'   // 应为 #f4f4f4
color: '#757f9c'         // 应为 #6d726e (--muted-foreground)
```

### 参考项目 (AppSidebar.tsx + shadcn Sidebar)

```tsx
// 使用 Tailwind utility class，自动解析 CSS 变量
<SidebarMenuButton
  className="text-sidebar-foreground hover:bg-sidebar-accent 
             data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground"
/>
// bg-sidebar-accent → var(--sidebar-accent) → #f6f6f6
// text-sidebar-accent-foreground → var(--sidebar-accent-foreground) → #18181a
```

### 关键差异清单

| 元素 | 当前值 | 参考值 (CSS 变量) | 严重程度 |
|------|--------|-----------------|---------|
| active 背景 | `#eef1fb` (蓝紫) | `#f6f6f6` (`--sidebar-accent`) | **高** |
| active 文字 | `#3a4fbf` (蓝紫) | `#18181a` (`--sidebar-accent-foreground`) | **高** |
| 非active 文字 | `#464c5e` (冷蓝灰) | `#858b9c` (`--sidebar-foreground`) | **中** |
| 侧边栏边框 | `#e3e7f1` (冷蓝灰) | `#f4f4f4` (`--sidebar-border`) | **中** |
| 分区标题 | `#9aa0b5` (冷蓝灰) | `#858b9c` (`--sidebar-foreground`) | **低** |
| 侧边栏背景 | `#fbfbf9` (接近) | `#ffffff` (`--sidebar`) | **低** |
| 顶部条边框 | `#e3e7f1` (冷蓝灰) | `#f4f4f4` (`--sidebar-border`) | **中** |
| 顶部条文字 | `#757f9c` (冷蓝灰) | `#6d726e` (`--muted-foreground`) | **中** |
| 毛玻璃效果 | 无 | `backdrop-blur-[9.5px]` | **中** |
| 可折叠 | 无 | 220px ↔ 72px | **中** |

---

## 四、enterprise-ui.ts 色值替换映射表

这是影响面最大的文件，49 个页面/组件引用了它的导出常量。逐项替换为 CSS 变量即可修复 750+ 处硬编码：

| 常量 | 当前硬编码值 | 替换为 (CSS 变量) |
|------|-------------|-----------------|
| `MENU_ITEM_CLASS` text | `#858b9c` | `var(--sidebar-foreground)` 即 `#858b9c` (一致，无需改) |
| `MENU_ITEM_CLASS` focus text | `#18181a` | `var(--sidebar-accent-foreground)` 即 `#18181a` (一致) |
| `SELECT_TRIGGER_CLASS` border | `#e3e7f1` | `var(--border)` 即 `#ded7cc` |
| `SELECT_TRIGGER_CLASS` text | `#464c5e` | `var(--foreground)` 即 `#20201d` |
| `SELECT_TRIGGER_CLASS` placeholder | `#858b9c` | `var(--muted-foreground)` 即 `#6d726e` |
| `SELECT_TRIGGER_CLASS` hover border | `#cbd3e6` | `var(--border-strong)` 即 `#cfc5b7` |
| `SELECT_TRIGGER_CLASS` focus border | `#18181a` | `var(--ring)` 即 `#0f766e` |
| `MOBILE_CARD_CLASS` border | `#eceef1` | `var(--border)` 即 `#ded7cc` |
| `DIALOG_FOOTER_CLASS` bg | `white` | `var(--surface)` 即 `#ffffff` (一致) |
| `DIALOG_CANCEL_BUTTON_CLASS` border | `#e3e7f1` | `var(--border)` 即 `#ded7cc` |
| `DIALOG_CANCEL_BUTTON_CLASS` text | `#464c5e` | `var(--foreground)` 即 `#20201d` |
| `DIALOG_CANCEL_BUTTON_CLASS` hover bg | `#f6f6f6` | `var(--surface-muted)` 即 `#eeece4` |
| `DIALOG_CANCEL_BUTTON_CLASS` hover text | `#18181a` | `var(--foreground)` 即 `#20201d` |
| **`DIALOG_PRIMARY_BUTTON_CLASS` bg** | **`#18181a`** | **`var(--primary)` 即 `#0f766e` (Teal)** |
| `DIALOG_PRIMARY_BUTTON_CLASS` hover bg | `#303030` | `var(--accent)` 深一档 或 `#0d6358` |
| `OUTLINE_ACTION_BUTTON_CLASS` border | `#e3e7f1` | `var(--border)` 即 `#ded7cc` |
| `OUTLINE_ACTION_BUTTON_CLASS` text | `#757f9c` | `var(--muted-foreground)` 即 `#6d726e` |
| `OUTLINE_ACTION_BUTTON_CLASS` hover border | `#cbd3e6` | `var(--border-strong)` 即 `#cfc5b7` |
| `OUTLINE_ACTION_BUTTON_CLASS` hover text | `#18181a` | `var(--foreground)` 即 `#20201d` |
| `OUTLINE_ACTION_BUTTON_SM_CLASS` border | `#e3e7f1` | `var(--border)` |
| `OUTLINE_ACTION_BUTTON_SM_CLASS` text | `#464c5e` | `var(--foreground)` |
| `OUTLINE_ACTION_BUTTON_SM_CLASS` hover bg | `#f6f6f6` | `var(--surface-muted)` |
| `SEARCH_COMBO_CLASS` border | `#e3e7f1` | `var(--border)` |
| `SEARCH_COMBO_CLASS` focus border | `#18181a` | `var(--ring)` 即 `#0f766e` |
| `SEARCH_COMBO_INPUT_CLASS` text | `#17191f` | `var(--foreground)` |
| `SEARCH_COMBO_INPUT_CLASS` placeholder | `#c0c6d4` | `var(--muted-soft)` 即 `#9a9b95` |
| **`SEARCH_COMBO_BUTTON_CLASS` bg** | **`#18181a`** | **`var(--primary)` 即 `#0f766e` (Teal)** |
| `SEARCH_COMBO_BUTTON_CLASS` hover bg | `#303030` | `#0d6358` (Teal 深一档) |

---

## 五、staffTokens.ts 修复方案

将所有 `primary.main` / `primary.dark` 引用替换为硬编码 Teal 色值，使 staff 模块不受主程序 accent 设置影响：

```typescript
// 修复前
searchComboButton: {
  bgcolor: 'primary.main',     // #111827 (随用户变化)
  '&:hover': { bgcolor: 'primary.dark' },
}
dialogPrimaryButton: {
  bgcolor: 'primary.main',     // #111827
  '&:hover': { bgcolor: 'primary.dark' },
}
primaryButton: {
  bgcolor: 'primary.main',     // #111827
  '&:hover': { bgcolor: 'primary.dark' },
}

// 修复后
searchComboButton: {
  bgcolor: '#0f766e',          // Teal (固定)
  '&:hover': { bgcolor: '#0d6358' },
}
dialogPrimaryButton: {
  bgcolor: '#0f766e',
  '&:hover': { bgcolor: '#0d6358' },
}
primaryButton: {
  bgcolor: '#0f766e',
  '&:hover': { bgcolor: '#0d6358' },
}
```

同时将 `text.secondary` / `text.primary` / `divider` 等 MUI 语义色替换为 CSS 变量值：
```typescript
// 修复前
color: 'text.secondary'    // MUI 默认灰，色温不确定
borderColor: 'divider'     // MUI 默认灰

// 修复后
color: '#6d726e'           // var(--muted-foreground) 暖灰
borderColor: '#ded7cc'     // var(--border) 暖米色
```

---

## 六、StaffLayout.tsx 修复方案

### 侧边栏 active 状态

```tsx
// 修复前 (第 149-151 行)
active
  ? { bgcolor: '#eef1fb', color: '#3a4fbf', fontWeight: 500 }
  : { color: '#464c5e', '&:hover': { bgcolor: '#f6f6f6' } }

// 修复后 (对齐参考项目 CSS 变量)
active
  ? { bgcolor: '#f6f6f6', color: '#18181a', fontWeight: 500 }   // --sidebar-accent / --sidebar-accent-foreground
  : { color: '#858b9c', '&:hover': { bgcolor: '#f6f6f6' } }     // --sidebar-foreground / --sidebar-accent
```

### 侧边栏容器

```tsx
// 修复前
borderColor: '#e3e7f1'    →  borderColor: '#f4f4f4'    // --sidebar-border
bgcolor: '#fbfbf9'        →  bgcolor: '#ffffff'          // --sidebar

// 顶部条
borderColor: '#e3e7f1'    →  borderColor: '#f4f4f4'
color: '#757f9c'          →  color: '#6d726e'             // --muted-foreground

// 分区标题
color: '#9aa0b5'          →  color: '#858b9c'             // --sidebar-foreground
```

---

## 七、结构性差异（非颜色）

### 7.1 侧边栏组件

| 特性 | 参考项目 AppSidebar | 当前 StaffLayout.StaffSidebar |
|------|--------------------|-----------------------------|
| 底层组件 | shadcn Sidebar (Radix) | MUI Box component="button" |
| 可折叠 | 220px ↔ 72px (带动画) | 固定 220px |
| 毛玻璃 | `backdrop-blur-[9.5px]` | 无 |
| Agent 切换器 | 有 (下拉选择当前员工) | 无 |
| 对话端模式 | 有 (会话列表 + 筛选) | 无 |
| 图标来源 | 自定义 SVG (assets/icons/) | lucide-react |
| 导航项样式 | 40px 高 / 14px 字 / 14px 圆角 | 36px 高 / 13px 字 / 10px 圆角 |
| 底部操作 | 对话端入口 + 折叠按钮 | 无 |

### 7.2 顶部 Header

| 特性 | 参考项目 AppHeader | 当前 StaffLayout header |
|------|-------------------|----------------------|
| 高度 | 动态 (含 ModelSetup banner) | 固定 44px |
| 功能 | 标题 + 返回 + 用户菜单 + 模型配置 | 仅用户名 + 退出按钮 |
| Model Setup | 有 (全宽 banner 提醒) | 无 |

### 7.3 页面组件抽查

| 页面 | UI 框架 | 颜色来源 | 主要问题 |
|------|---------|---------|---------|
| LoginPage | MUI Box/TextField | MUI theme | 未使用 Teal，未引用 staffdeck 图片 |
| AgentsPage | MUI Box + UnderlineTabs | 硬编码 `#f6f6f6` | 卡片背景冷灰，应为暖米 |
| DashboardPage | MUI Box + shadcn wrapper | staffTokens | primary.main = #111827 ≠ Teal |
| OpenPlatformPage | MUI Box + shadcn wrapper | staffTokens + 硬编码 | 混合色源，不统一 |
| ChatPage | MUI Box | chatTokens.ts (88处硬编码) | 对话气泡/输入框全冷灰 |
| TutorialPage | MUI Box | 硬编码 (45处) | 最多硬编码的页面 |
| ToolsPage | MUI Box | 硬编码 (77处) | 第二多硬编码 |

---

## 八、修复优先级和工作量估算

### P0 — 立即可修复（影响面最大，改动最小）

| 任务 | 文件数 | 改动量 | 效果 |
|------|--------|--------|------|
| enterprise-ui.ts 色值替换 | 1 文件 | ~30 行 | 49 个文件 750+ 处自动生效 |
| staffTokens.ts 固定 Teal | 1 文件 | ~15 行 | 所有 staffTokens 消费者变 Teal |
| StaffLayout.tsx 侧边栏色值 | 1 文件 | ~10 行 | 侧边栏视觉立即对齐 |

**预期效果**: 修改 3 个文件，覆盖 49+ 个文件的视觉输出，整体复刻度从 ~35% 提升到 ~70%。

### P1 — 页面级修复（需逐文件处理）

| 任务 | 文件数 | 说明 |
|------|--------|------|
| 页面 sx 硬编码色值替换 | ~49 文件 | 将 `#464c5e` / `#e3e7f1` / `#18181a` 等替换为 CSS 变量或 staffTokens |
| chatTokens.ts 色值替换 | 1 文件 | 88 处硬编码 |
| distillTokens.ts 色值替换 | 1 文件 | 119 处硬编码 |

### P2 — 结构性增强（可选）

| 任务 | 说明 |
|------|------|
| StaffLayout 侧边栏增加 Agent 切换器 | 对齐参考项目核心交互 |
| 侧边栏可折叠 | 220px ↔ 72px |
| 侧边栏毛玻璃效果 | backdrop-blur |
| AppHeader 增强 | 标题 + 返回 + 模型配置 banner |
| 自定义 SVG 图标替换 lucide-react | 对齐参考项目图标体系 |

---

## 九、总结

当前数字员工前端的"骨架"已经完成（页面 20 个、组件 65+、路由 30+、CSS 1654 行、资产 97 个），但"皮肤"还是旧的——三套颜色体系并行运行，CSS 变量虽正确定义但消费率仅 2%，实际渲染使用的是一套冷蓝灰色系（`#464c5e` / `#e3e7f1` / `#18181a`），与参考项目的暖米色 + Teal 设计系统完全不同。

**最快修复路径**: 修改 `enterprise-ui.ts` + `staffTokens.ts` + `StaffLayout.tsx` 三个文件，即可让 49+ 个文件的视觉输出对齐参考项目，将复刻度从 ~35% 提升到 ~70%。后续再逐文件清理页面级硬编码即可达到 100%。
