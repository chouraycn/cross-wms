// 引用控制 marker 辅助：移除不支持的引用控制 token
const UNSUPPORTED_CITATION_CONTROL_MARKER_RE = /(?:[^]*)?/g;
const TRAILING_UNSUPPORTED_CITATION_CONTROL_MARKER_RE = /[ \t]*(?:[^]*)?(?=\r?\n|$)/g;

/** 移除不支持的模型引用控制 marker，不破坏正常硬换行 */
export function stripUnsupportedCitationControlMarkers(text: string): string {
  return text
    .replace(TRAILING_UNSUPPORTED_CITATION_CONTROL_MARKER_RE, "")
    .replace(UNSUPPORTED_CITATION_CONTROL_MARKER_RE, "");
}
