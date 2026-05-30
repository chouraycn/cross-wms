/**
 * MSW Browser Setup
 * 在浏览器环境中启动 Mock Service Worker
 */

import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);
