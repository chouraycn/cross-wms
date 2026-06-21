/**
 * 各提供商 API Key 获取链接
 *
 * 集中管理所有 LLM 提供商的 API Key 申请页面 URL。
 * 被 ModelEditDialog 的"获取 Key"按钮和 ApiKeyHelpPage 共同引用。
 */

import { providerLabel } from './providerIcons';

/** 提供商 → API Key 获取页面 URL */
export const PROVIDER_API_KEY_URLS: Record<string, string> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  tencent: 'https://console.cloud.tencent.com/cam/capi',
  deepseek: 'https://platform.deepseek.com/api_keys',
  google: 'https://aistudio.google.com/app/apikey',
  qwen: 'https://dashscope.console.aliyun.com/apiKey',
  xai: 'https://console.x.ai/team/default/api-keys',
  zai: 'https://z.ai/settings/api-keys',
  minimax: 'https://www.minimaxi.com/user-center/basic-information/interface-key',
  kimi: 'https://platform.moonshot.cn/console/api-keys',
  byteplus: 'https://console.byteplus.com/ark/region:ark+cn-beijing/apiKey',
  openrouter: 'https://openrouter.ai/settings/keys',
  novita: 'https://novita.ai/settings/key-management',
  wwqglobal: 'https://www.wwq.com/console/api-keys',
  wwqcn: 'https://www.wwq.cn/console/api-keys',
  aws: 'https://us-east-1.console.aws.amazon.com/bedrock/home?region=us-east-1#/overview',
  azure: 'https://portal.azure.com/#home',
  vercel: 'https://vercel.com/dashboard/stores/ai',
  ollama: 'https://ollama.com/download',
  bigmodel: 'https://open.bigmodel.cn/usercenter/apikeys',
  minimaxcn: 'https://www.minimaxi.com/platform/login',
  kimicn: 'https://platform.moonshot.cn/console/api-keys',
  volcengine: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
  aliyun: 'https://dashscope.console.aliyun.com/apiKey',
  modelark: 'https://www.modelark.cn/console/api-keys',
  ppio: 'https://ppinfra.com/settings/key-management',
  custom: '',
};

/**
 * 获取提供商的中文名称
 * 委托给 providerIcons.tsx 中的 providerLabel 函数
 */
export function getProviderLabel(provider: string): string {
  return providerLabel(provider);
}

/**
 * 获取提供商的 API Key 申请页面 URL
 * @returns URL 字符串，若提供商无对应链接则返回空字符串
 */
export function getProviderApiKeyUrl(provider: string): string {
  return PROVIDER_API_KEY_URLS[provider] || '';
}
