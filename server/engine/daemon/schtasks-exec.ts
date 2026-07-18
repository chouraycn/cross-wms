/**
 * 执行 Windows 任务计划程序命令，带守护进程友好的超时。
 */
import { execFileUtf8 } from "./exec-file.js";

const SCHTASKS_TIMEOUT_MS = 15_000;

export async function execSchtasks(
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCHTASKS_TIMEOUT_MS);

  try {
    const result = await execFileUtf8("schtasks", args, {
      signal: controller.signal,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if ((err as Error).name === "AbortError") {
      return {
        stdout: "",
        stderr: `schtasks timed out after ${SCHTASKS_TIMEOUT_MS}ms`,
        code: 124,
      };
    }
    return {
      stdout: "",
      stderr: message,
      code: 1,
    };
  } finally {
    clearTimeout(timeout);
  }
}
