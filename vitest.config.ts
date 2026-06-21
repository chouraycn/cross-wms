import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: [
      'src/__tests__/**/*.test.{ts,tsx}',
      'src/components/**/__tests__/**/*.test.{ts,tsx}',
      'src/hooks/**/__tests__/**/*.test.{ts,tsx}',
      'src/services/**/__tests__/**/*.test.{ts,tsx}',
      'src/stores/**/__tests__/**/*.test.{ts,tsx}',
      'server/__tests__/**/*.test.{ts,tsx}',
      'server/**/__tests__/**/*.test.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/services/**',
        'src/stores/**',
        'src/capabilities/**',
        'server/aiClient.ts',
        'server/engine/reactExecutor.ts',
        'server/routes/chatService.ts',
        'server/engine/toolRegistry.ts',
        'server/engine/budgetManager.ts',
        'server/engine/loopDetector.ts',
        'server/engine/multilingualIntent.ts',
        'server/engine/contextTruncate.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@src': path.resolve(__dirname, './src'),
    },
    conditions: ['node'],
  },
  ssr: {
    noExternal: ['@e965/xlsx'],
  },
});
