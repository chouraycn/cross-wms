/**
 * 检测当前进程是否在 launchd 服务标签内运行。
 */

export type CurrentProcessLaunchdServiceLabelOptions = {
  allowConfiguredLabelFallback?: boolean;
};

export function isCurrentProcessLaunchdServiceLabel(
  label: string,
  env: NodeJS.ProcessEnv = process.env,
  options: CurrentProcessLaunchdServiceLabelOptions = {},
): boolean {
  const currentLabels = [env.LAUNCH_JOB_LABEL, env.LAUNCH_JOB_NAME, env.XPC_SERVICE_NAME].flatMap(
    (value) => {
      const normalized = value?.trim();
      return normalized ? [normalized] : [];
    },
  );

  for (const currentLabel of currentLabels) {
    if (currentLabel === label) {
      return true;
    }
  }

  const configuredLabel = env.CROSS_WMS_LAUNCHD_LABEL?.trim();
  if (!configuredLabel || configuredLabel !== label) {
    return false;
  }
  if (
    env.CROSS_WMS_SERVICE_MARKER === "crosswms" &&
    Boolean(env.CROSS_WMS_SERVICE_KIND)
  ) {
    return true;
  }
  return options.allowConfiguredLabelFallback !== false && currentLabels.length === 0;
}
