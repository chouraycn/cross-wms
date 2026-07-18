/**
 * Provider 适配器统一导出
 */

import * as deepseekAdapter from './deepseek';
import * as alibabaAdapter from './alibaba';
import * as kimiAdapter from './kimi';
import * as stepfunAdapter from './stepfun';
import * as doubaoAdapter from './doubao';
import * as yiAdapter from './yi';
import * as baichuanAdapter from './baichuan';
import * as minimaxAdapter from './minimax';

export {
  deepseekAdapter,
  alibabaAdapter,
  kimiAdapter,
  stepfunAdapter,
  doubaoAdapter,
  yiAdapter,
  baichuanAdapter,
  minimaxAdapter,
};

/**
 * 根据提供商获取适配器
 */
export function getAdapterForProvider(providerId: string) {
  switch (providerId) {
    case 'deepseek':
      return deepseekAdapter;
    case 'alibaba':
      return alibabaAdapter;
    case 'kimi':
      return kimiAdapter;
    case 'stepfun':
      return stepfunAdapter;
    case 'doubao':
      return doubaoAdapter;
    case 'yi':
      return yiAdapter;
    case 'baichuan':
      return baichuanAdapter;
    case 'minimax':
      return minimaxAdapter;
    default:
      return null;
  }
}