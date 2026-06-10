/**
 * 各 Provider 默认 API 端点映射 — 覆盖 24+ 主流平台
 *
 * 前后端共享数据，从 styles.ts 提取为独立模块。
 */

/** 各 Provider 默认 API 端点映射 */
export const PROVIDER_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  tencent: 'https://api.hunyuan.cloud.tencent.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  xai: 'https://api.x.ai/v1',
  zai: 'https://api.z.ai/v1',
  minimax: 'https://api.minimaxi.chat/v1',
  kimi: 'https://api.moonshot.cn/v1',
  byteplus: 'https://api.byteplus.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  novita: 'https://api.novita.ai/v3/openai',
  wwqglobal: 'https://api.wwq.com/v1',
  wwqcn: 'https://api.wwq.cn/v1',
  aws: 'https://bedrock-runtime.us-east-1.amazonaws.com',
  azure: 'https://{resource}.openai.azure.com/openai/deployments/{deployment}',
  vercel: 'https://api.vercel.com/v1/ai',
  ollama: 'http://localhost:11434/v1',
  bigmodel: 'https://open.bigmodel.cn/api/paas/v4',
  minimaxcn: 'https://api.minimax.chat/v1',
  kimicn: 'https://api.moonshot.cn/v1',
  volcengine: 'https://ark.cn-beijing.volces.com/api/v3',
  aliyun: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  modelark: 'https://api.modelark.cn/v1',
  ppio: 'https://api.ppinfra.com/v3/openai',
} as const;
