/**
 * MSW 主入口文件
 * 根据环境变量决定是否启用 Mock
 *
 * 使用方式：
 * 1. 在 .env.development 中添加 VITE_ENABLE_MOCK=true
 * 2. 在 main.tsx 中导入并初始化
 *
 * ```ts
 * import { initMsw } from './mocks';
 * initMsw();
 * ```
 */

export async function initMsw() {
  if (typeof window === 'undefined') {
    return;
  }

  const enableMock = import.meta.env.VITE_ENABLE_MOCK === 'true';

  if (!enableMock) {
    return;
  }

  try {
    const { worker } = await import('./browser');
    await worker.start({
      serviceWorker: {
        url: '/mockServiceWorker.js',
      },
      onUnhandledRequest: 'bypass',
    });
    console.log('[MSW] Mock API 已启动');
  } catch (error) {
    console.error('[MSW] 启动失败:', error);
  }
}
