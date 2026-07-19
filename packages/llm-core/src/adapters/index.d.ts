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
export { deepseekAdapter, alibabaAdapter, kimiAdapter, stepfunAdapter, doubaoAdapter, yiAdapter, baichuanAdapter, minimaxAdapter, };
/**
 * 根据提供商获取适配器
 */
export declare function getAdapterForProvider(providerId: string): typeof deepseekAdapter | typeof alibabaAdapter | typeof kimiAdapter | typeof stepfunAdapter | typeof doubaoAdapter | typeof yiAdapter | typeof baichuanAdapter | typeof minimaxAdapter | null;
//# sourceMappingURL=index.d.ts.map