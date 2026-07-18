/** 为审批提示紧凑格式化用户主目录路径，不规范化不安全路径。 */
export function formatApprovalDisplayPath(value: string): string {
  const normalized = value.trim();
  if (!normalized || hasRelativePathSegment(normalized)) {
    return normalized;
  }

  const unixHomeMatch = normalized.match(/^\/(?:home|Users)\/([^/]+)(.*)$/);
  if (unixHomeMatch && isSafeHomeSegment(unixHomeMatch[1])) {
    // 对 Linux 和 macOS 路径都使用仅用于显示的主目录压缩；
    // 审批匹配仍使用原始路径值。
    return compactHomeSuffix(unixHomeMatch[2] ?? "");
  }

  const windowsHomeMatch = normalized.match(/^[A-Za-z]:[\\/]Users[\\/]([^\\/]+)(.*)$/i);
  if (windowsHomeMatch && isSafeHomeSegment(windowsHomeMatch[1])) {
    // 仅在证明这是纯 Windows 用户主目录路径后才规范化斜杠。
    return compactHomeSuffix(windowsHomeMatch[2] ?? "");
  }

  return normalized;
}

function compactHomeSuffix(suffix: string): string {
  return `~${suffix.replace(/\\/g, "/")}`;
}

function isSafeHomeSegment(segment: string | undefined): boolean {
  return segment !== undefined && segment !== "." && segment !== "..";
}

function hasRelativePathSegment(value: string): boolean {
  // 不要压缩包含 `.` 或 `..` 的路径；隐藏这些段会使审批提示
  // 比实际将评估的路径不够精确。
  return /(^|[\\/])\.{1,2}(?=[\\/]|$)/.test(value);
}
