// 检测本地桌面 UX 不可用的远程/容器环境。
// 降级实现：从 openclaw/src/infra/remote-env.ts 直接移植，使用本地 ./wsl.js。
import { isWSLEnv } from "./wsl.js";

// 远程环境检测门控依赖于桌面会话或直接主机访问的本地 UX。
export function isRemoteEnvironment(): boolean {
  if (process.env.SSH_CLIENT || process.env.SSH_TTY || process.env.SSH_CONNECTION) {
    return true;
  }

  if (process.env.REMOTE_CONTAINERS || process.env.CODESPACES) {
    return true;
  }

  if (
    process.platform === "linux" &&
    !process.env.DISPLAY &&
    !process.env.WAYLAND_DISPLAY &&
    !isWSLEnv()
  ) {
    return true;
  }

  return false;
}
