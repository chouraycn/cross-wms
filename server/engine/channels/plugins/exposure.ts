/**
 * 频道曝光助手 — 决定频道元数据是否出现在已配置/设置/文档视图中
 *
 * 参考 openclaw/src/channels/plugins/exposure.ts
 */

/** 频道曝光设置（用于 configured/setup/docs 视图可见性） */
export type ChannelExposure = {
  configured?: boolean;
  setup?: boolean;
  docs?: boolean;
};

/** 频道元数据曝光相关字段的子集 */
export type ChannelExposureMeta = {
  exposure?: ChannelExposure;
  showConfigured?: boolean;
  showInSetup?: boolean;
};

/** 解析频道应出现在 configured/setup/docs 视图的位置 */
export function resolveChannelExposure(meta: ChannelExposureMeta) {
  // showConfigured 与 showInSetup 是旧版元数据字段；
  // 保留为回退输入以兼容旧 bundled manifest 的可见性
  return {
    configured: meta.exposure?.configured ?? meta.showConfigured ?? true,
    setup: meta.exposure?.setup ?? meta.showInSetup ?? true,
    docs: meta.exposure?.docs ?? true,
  };
}

/** 返回频道是否应被列在已配置代理的列表中 */
export function isChannelVisibleInConfiguredLists(meta: ChannelExposureMeta): boolean {
  return resolveChannelExposure(meta).configured;
}

/** 返回频道是否应在 setup/onboarding 期间被提供 */
export function isChannelVisibleInSetup(meta: ChannelExposureMeta): boolean {
  return resolveChannelExposure(meta).setup;
}
