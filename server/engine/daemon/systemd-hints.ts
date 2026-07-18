/**
 * systemd 提示信息。
 */

export function buildSystemdInstallHints(params: {
  serviceName: string;
  hasUserServiceDir?: boolean;
  dbusAvailable?: boolean;
}): string[] {
  const hints: string[] = [];
  const serviceFile = `${params.serviceName}.service`;

  hints.push(`Install: systemctl --user enable --now ${serviceFile}`);
  hints.push(`Start: systemctl --user start ${serviceFile}`);
  hints.push(`Stop: systemctl --user stop ${serviceFile}`);
  hints.push(`Status: systemctl --user status ${serviceFile}`);
  hints.push(`Logs: journalctl --user -u ${serviceFile} -n 200 --no-pager`);

  if (!params.dbusAvailable) {
    hints.push("Note: D-Bus session bus not available. User services may not work correctly.");
    hints.push("Try: export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$UID/bus");
  }

  return hints;
}

export function buildSystemdUninstallHints(serviceName: string): string[] {
  const serviceFile = `${serviceName}.service`;
  return [
    `Disable: systemctl --user disable --now ${serviceFile}`,
    `Remove: rm ~/.config/systemd/user/${serviceFile}`,
    "Reload: systemctl --user daemon-reload",
  ];
}

export function formatSystemdStatusLine(status: {
  loaded: boolean;
  active: boolean;
  state?: string;
  subState?: string;
  pid?: number;
}): string {
  if (!status.loaded) {
    return "not loaded";
  }
  const state = status.state || (status.active ? "active" : "inactive");
  const subState = status.subState ? ` (${status.subState})` : "";
  const pid = status.pid ? ` pid=${status.pid}` : "";
  return `${state}${subState}${pid}`;
}
