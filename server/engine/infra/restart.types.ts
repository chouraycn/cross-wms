// RestartAttempt 记录特定平台重启路径尝试的监督机制。
export type RestartAttempt = {
  ok: boolean;
  method: "launchctl" | "systemd" | "schtasks" | "supervisor";
  detail?: string;
  tried?: string[];
};
