/**
 * ModelManager 共享样式常量
 *
 * 从三份重复代码中提取公共样式，统一管理。
 */

/** Switch 组件样式 — 深色选中态 */
export const switchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': { color: '#111827' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#111827' },
} as const;

/** TextField 组件样式 — 统一字体大小 */
export const textFieldSx = {
  '& .MuiOutlinedInput-root': { fontSize: '0.8125rem' },
  '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
} as const;

/** 各 Provider 默认 API 端点映射 — 覆盖 24+ 主流平台 */
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

/** 滑块标签样式 */
export const sliderLabelSx = {
  fontSize: '0.75rem',
  color: '#6B7280',
  mb: 0.5,
} as const;

/** 滑块值样式 */
export const sliderValueSx = {
  fontSize: '0.75rem',
  color: '#111827',
  fontWeight: 500,
  ml: 1,
} as const;

/** 工具栏按钮统一样式 */
export const toolbarButtonSx = {
  backgroundColor: '#E5E7EB',
  color: '#374151',
  fontSize: '0.8125rem',
  px: 2,
  py: 0.5,
  borderRadius: 1.5,
  boxShadow: 'none',
  '&:hover': { backgroundColor: '#D1D5DB', boxShadow: 'none' },
} as const;

/** 主操作按钮样式 */
export const primaryButtonSx = {
  backgroundColor: '#111827',
  '&:hover': { backgroundColor: '#374151' },
  fontSize: '0.8rem',
} as const;

/** 危险操作按钮样式（删除等） */
export const dangerButtonSx = {
  color: '#EF4444',
} as const;

/** 颜色常量 */
export const COLORS = {
  textPrimary: '#111827',
  textSecondary: '#374151',
  textMuted: '#6B7280',
  textLight: '#9CA3AF',
  bgLight: '#F3F4F6',
  bgHover: '#F3F4F6',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  success: '#10B981',
  successHover: '#059669',
  successBg: '#F0FDF4',
  error: '#EF4444',
  errorBg: '#FEE2E2',
  errorText: '#991B1B',
  infoBg: '#EFF6FF',
  infoText: '#1E40AF',
} as const;
