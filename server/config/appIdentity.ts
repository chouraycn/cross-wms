const DEFAULT_APP_NAME = 'CDF Know Clow';
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
