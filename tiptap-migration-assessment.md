# CDF Know Claw — 输入框富文本框架迁移评估

## 一、候选方案对比

| 维度 | **TipTap 3.0** | **Slate.js** | **Lexical (Meta)** |
|---|---|---|---|
| **底层引擎** | ProseMirror（成熟稳定） | 自研（嵌套文档模型） | 自研（Facebook 出品） |
| **React 集成** | 官方 React 包 `@tiptap/react`，SSR 支持 | `slate-react`，深度绑定 React | `@lexical/react`，React 优先 |
| **包体积（gzip）** | ~40KB 核心 + 按需扩展 | ~25KB 核心 + 插件 | ~30KB 核心 + 插件 |
| **学习曲线** | 低 — 声明式配置，开箱即用 | 高 — 需理解底层数据模型 | 中 — React 友好但生态较新 |
| **扩展生态** | 丰富（100+ 官方/社区扩展） | 中等（社区插件分散） | 较少（Meta 主推，社区在成长） |
| **Markdown 支持** | 内置 `Markdown` 扩展（3.x 新增） | 需自行实现序列化/反序列化 | 需 `@lexical/markdown` |
| **协作编辑** | 官方 `Collaboration` 扩展（Yjs） | 需自行集成 Yjs | 官方支持（Meta 内部用） |
| **TypeScript** | 优秀（3.0 类型系统大幅增强） | 良好 | 良好 |
| **维护活跃度** | 高（2025 发布 3.0，持续迭代） | 中（社区驱动，更新较慢） | 中（Meta 维护，节奏稳定） |
| **国内社区** | 活跃（掘金/知乎教程丰富） | 较少 | 很少 |

## 二、CDF Know Claw 场景适配分析

### 当前需求

1. **多行文本输入** — Shift+Enter 换行，Enter 发送
2. **斜杠命令 `/`** — 触发技能选择器，键盘导航
3. **@ 引用** — 触发会话引用选择器
4. **技能 Chip 展示** — 选中技能后在输入框上方显示
5. **意图分类 Chips** — 选中技能后显示查询意图
6. **引用会话 Chips** — 显示已引用的会话
7. **IME 中文输入兼容** — 组合状态追踪
8. **内容同步** — 读取/清空/设置内容
9. **光标管理** — 聚焦、移到末尾

### TipTap 适配评估

| 需求 | TipTap 支持度 | 实现方式 |
|---|---|---|
| 多行文本输入 | 原生支持 | `HardBreak` 扩展 + Enter 命令拦截 |
| 斜杠命令 `/` | 官方 `Suggestion` 扩展 | `@tiptap/suggestion` + `tippy.js` |
| @ 引用 | 官方 `Mention` 扩展 | `@tiptap/extension-mention` |
| 技能 Chip | 需自定义 Node | 自定义 `skill-chip` Node + NodeView |
| 意图分类 Chips | 需自定义 Node | 同上 |
| 引用会话 Chips | 需自定义 Node | 同上 |
| IME 兼容 | 原生支持 | ProseMirror 内置 composition 处理 |
| 内容同步 | API 完善 | `editor.getText()` / `editor.commands.setContent()` |
| 光标管理 | API 完善 | `editor.commands.focus('end')` |

**优势：**
- `@tiptap/extension-mention` 直接支持 `@` 触发，无需手动解析
- `@tiptap/suggestion` 提供完整的键盘导航（上下箭头+Enter）
- ProseMirror 原生处理 IME，无需 `isComposingRef` workaround
- 3.0 新增 `editor.unmount()` 支持页面切换缓存
- Markdown 双向转换即将原生支持（`renderMarkdown()` / `parseMarkdown()`）

**劣势：**
- 自定义 Node（Chip）需要理解 ProseMirror Schema
- 包体积比 Slate 大 ~15KB
- 3.0 有破坏性变更（UMD 移除、API 改名）

### Slate.js 适配评估

| 需求 | Slate 支持度 | 实现方式 |
|---|---|---|
| 多行文本输入 | 原生支持 | `soft-break` 插件 |
| 斜杠命令 `/` | 需自行实现 | `onKeyDown` + 浮动菜单 |
| @ 引用 | 需自行实现 | `onKeyDown` + 浮动菜单 |
| 技能 Chip | 需自定义 Element | `isVoid` + `renderElement` |
| 意图分类 Chips | 需自定义 Element | 同上 |
| 引用会话 Chips | 需自定义 Element | 同上 |
| IME 兼容 | 需手动处理 | `onCompositionStart/End` |
| 内容同步 | API 完善 | `Editor.string()` / `Transforms.insertNodes()` |
| 光标管理 | API 完善 | `ReactEditor.focus()` + `Transforms.select()` |

**优势：**
- 包体积小，核心 ~25KB
- 数据模型完全可控，JSON 结构清晰
- React 集成深度绑定，渲染逻辑完全自定义

**劣势：**
- 所有高级功能（Mention、Suggestion）需从零实现
- IME 处理不如 ProseMirror 成熟
- 社区插件分散，维护活跃度下降
- 学习曲线陡峭

## 三、迁移成本估算

### TipTap 3.0 迁移

```
工作量：中等（3-5 天）

新增依赖：
  @tiptap/core
  @tiptap/react
  @tiptap/starter-kit
  @tiptap/extension-mention        ← @ 引用
  @tiptap/suggestion               ← 斜杠命令
  @tiptap/extension-placeholder    ← placeholder
  @tiptap/extension-hard-break     ← Shift+Enter 换行

需重写文件：
  TopBarChatInput.tsx      — 完全重写（~600 行 → ~400 行）
  SkillSelector.tsx        — 适配 TipTap Suggestion API
  SessionReferenceSelector — 适配 TipTap Mention API

新增文件：
  SkillChipExtension.ts    — 自定义技能 Chip Node
  IntentChipExtension.ts   — 自定义意图 Chip Node
  SessionChipExtension.ts  — 自定义引用 Chip Node

风险点：
  - TipTap 3.0 有破坏性变更，需检查 peer dependency
  - 自定义 NodeView 与 MUI 样式集成需调试
  - 与现有 useChat 的 sendMessage 接口需适配
```

### Slate.js 迁移

```
工作量：高（5-8 天）

新增依赖：
  slate
  slate-react
  slate-history

需重写文件：
  TopBarChatInput.tsx      — 完全重写（~600 行 → ~500 行）
  SkillSelector.tsx        — 完全重写（浮动菜单 + 键盘导航）
  SessionReferenceSelector — 完全重写

新增文件：
  withMentions.ts          — Mention 插件
  withSlashCommands.ts     — 斜杠命令插件
  ChipElement.tsx          — Chip 渲染组件
  MentionElement.tsx       — Mention 渲染组件

风险点：
  - 所有交互逻辑需从零实现
  - IME 处理需自行测试验证
  - 长期维护成本高（社区活跃度下降）
```

## 四、推荐方案

### 推荐：TipTap 3.0

**理由：**

1. **需求匹配度最高** — `@tiptap/extension-mention` 和 `@tiptap/suggestion` 直接覆盖 `/` 斜杠命令和 `@` 引用两大核心需求
2. **开发效率** — 3-5 天即可完成迁移，Slate 需要 5-8 天
3. **长期维护** — TipTap 团队活跃（2025 发布 3.0），ProseMirror 底层稳定
4. **生态丰富** — 100+ 扩展，未来需要协作编辑、Markdown 导入导出等功能时可直接使用
5. **IME 原生支持** — 无需手动追踪 `isComposingRef`
6. **TypeScript 优秀** — 3.0 类型系统增强，与现有代码库兼容性好

**实施路径：**

```
Phase 1（1-2 天）：基础替换
  - 安装 TipTap 依赖
  - 用 TipTap Editor 替换 contentEditable div
  - 实现 Enter 发送 / Shift+Enter 换行
  - 实现内容读取/清空/设置

Phase 2（1-2 天）：斜杠命令 + @ 引用
  - 集成 @tiptap/suggestion 实现 / 技能选择
  - 集成 @tiptap/extension-mention 实现 @ 会话引用
  - 键盘导航（上下箭头 + Enter）

Phase 3（1 天）：Chip 展示
  - 自定义 skill-chip Node + NodeView
  - 自定义 session-chip Node + NodeView
  - 与 MUI Chip 组件样式统一

Phase 4（0.5 天）：收尾
  - IME 测试（中文/日文/韩文）
  - 暗色模式适配
  - 性能测试（大文本输入）
```

## 五、保留现状的合理性

如果近期无以下需求，可暂缓迁移：

- 富文本格式化（粗体/斜体/代码块等）
- 图片/文件拖拽上传
- 协作编辑
- 复杂的 @mention 内联展示

当前 `contentEditable` 方案在纯文本场景下工作正常，迁移的主要收益是**扩展性**和**可维护性**，而非修复现有功能缺陷。
