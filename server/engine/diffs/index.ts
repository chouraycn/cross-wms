/**
 * Diffs 工具入口
 *
 * 移植自 openclaw/extensions/diffs，提供代码差异可视化能力：
 *   - 接受 before/after 文本或 patch 格式输入
 *   - 渲染为带语法高亮的独立 HTML 文件
 *   - 支持 side-by-side（split）与 inline（unified）布局
 *   - 支持暗色/亮色主题
 */
export {
  DEFAULT_DIFFS_TOOL_DEFAULTS,
  DIFF_LAYOUTS,
  DIFF_MODES,
  DIFF_OUTPUT_FORMATS,
  DIFF_THEMES,
} from "./types.js";
export type {
  BeforeAfterDiffInput,
  DiffFile,
  DiffInput,
  DiffLayout,
  DiffLine,
  DiffMode,
  DiffOutputFormat,
  DiffPresentation,
  DiffRenderOptions,
  DiffRenderTarget,
  DiffTheme,
  DiffToolDefaults,
  PatchDiffInput,
  RenderedDiffDocument,
} from "./types.js";

export {
  buildBeforeAfterFile,
  computeLineDiff,
  normalizeLayout,
  normalizeTheme,
  parsePatchFiles,
  renderDiffDocument,
  resolveDefaultRenderOptions,
} from "./render.js";
export { __testing as __renderTesting } from "./render.js";

export {
  createDiffsTool,
  type AgentToolResult,
  type AnyAgentTool,
  type CreateDiffsToolOptions,
  type DiffsToolParams,
} from "./diffsTool.js";
