// 规范名无空格，与 Swift 宿主(AppConfig.swift 使用 'CDFKnowClow')保持一致，
// 避免 dev(npm run dev, 无 CDF_DATA_DIR 注入) 与发布版落到不同目录导致历史对话分裂。
const DEFAULT_APP_NAME = 'CDFKnowClow';
const DEFAULT_APP_DIR_NAME = '.cdf-know-clow';
const DEFAULT_BUNDLE_ID = 'com.cdf.knowclow.desktop';

export const AppIdentity = {
  appName: process.env.CDF_APP_NAME || DEFAULT_APP_NAME,
  appDirName: process.env.CDF_APP_DIR_NAME || DEFAULT_APP_DIR_NAME,
  bundleId: process.env.CDF_BUNDLE_ID || DEFAULT_BUNDLE_ID,
  productName: process.env.CDF_PRODUCT_NAME || DEFAULT_APP_NAME,
};

export function getAppName(): string {
  return AppIdentity.appName;
}

export function getAppDirName(): string {
  return AppIdentity.appDirName;
}

export function getBundleId(): string {
  return AppIdentity.bundleId;
}
