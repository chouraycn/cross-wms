/**
 * systemd linger 设置管理。
 */
import { execFileUtf8 } from "./exec-file.js";

export async function isLingerEnabled(user?: string): Promise<boolean> {
  const targetUser = user || process.env.USER || "";
  if (!targetUser) {
    return false;
  }
  try {
    const result = await execFileUtf8("loginctl", ["show-user", targetUser, "-p", "Linger"]);
    return result.stdout.trim() === "Linger=yes";
  } catch {
    return false;
  }
}

export async function enableLinger(user?: string): Promise<{ ok: boolean; detail?: string }> {
  const targetUser = user || process.env.USER || "";
  if (!targetUser) {
    return { ok: false, detail: "Cannot determine current user" };
  }
  try {
    const result = await execFileUtf8("loginctl", ["enable-linger", targetUser]);
    if (result.code === 0) {
      return { ok: true };
    }
    return { ok: false, detail: result.stderr || result.stdout };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export async function disableLinger(user?: string): Promise<{ ok: boolean; detail?: string }> {
  const targetUser = user || process.env.USER || "";
  if (!targetUser) {
    return { ok: false, detail: "Cannot determine current user" };
  }
  try {
    const result = await execFileUtf8("loginctl", ["disable-linger", targetUser]);
    if (result.code === 0) {
      return { ok: true };
    }
    return { ok: false, detail: result.stderr || result.stdout };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export function getLingerStatusMessage(enabled: boolean): string {
  return enabled
    ? "linger is enabled (user services survive logout)"
    : "linger is not enabled (user services stop on logout)";
}
