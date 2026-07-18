import { describe, expect, it } from 'vitest';
import { planProviderIndexModelCatalogRows } from '../provider-index-planner';
import type { ProviderIndex } from '../provider-index/types';

function createTestIndex(): ProviderIndex {
  return {
    version: 1,
    providers: {
      moonshot: {
        id: 'moonshot',
        name: 'Moonshot AI',
        plugin: {
          id: 'moonshot-plugin',
          package: '@cross-wms/plugin-moonshot',
        },
        categories: ['chat', 'chinese'],
        previewCatalog: {
          models: [
            {
              id: 'kimi-k2.6',
              name: 'Kimi K2.6',
              contextWindow: 262144,
              input: ['text', 'image'],
              status: 'available',
              capabilities: ['vision', 'json', 'tool_use'],
            },
          ],
        },
      },
      deepseek: {
        id: 'deepseek',
        name: 'DeepSeek',
        plugin: { id: 'deepseek-plugin' },
        previewCatalog: {
          models: [
            {
              id: 'deepseek-chat',
              name: 'DeepSeek Chat',
              contextWindow: 128000,
            },
          ],
        },
      },
      'no-preview': {
        id: 'no-preview',
        name: 'No Preview',
        plugin: { id: 'no-preview-plugin' },
      },
    },
  };
}

describe('provider-index-planner', () => {
  describe('planProviderIndexModelCatalogRows', () => {
    it('应该从可安装的 provider 元数据构建预览行', () => {
      const index = createTestIndex();
      const plan = planProviderIndexModelCatalogRows({ index });

      expect(plan.entries).toHaveLength(2);
      expect(plan.rows).toHaveLength(2);
    });

    it('应该按 provider 过滤', () => {
      const index = createTestIndex();
      const plan = planProviderIndexModelCatalogRows({
        index,
        providerFilter: 'moonshot',
      });

      expect(plan.entries).toHaveLength(1);
      expect(plan.entries[0].provider).toBe('moonshot');
      expect(plan.entries[0].pluginId).toBe('moonshot-plugin');
      expect(plan.rows).toHaveLength(1);
      expect(plan.rows[0].id).toBe('kimi-k2.6');
    });

    it('应该为没有 previewCatalog 的 provider 跳过', () => {
      const index = createTestIndex();
      const plan = planProviderIndexModelCatalogRows({ index });

      const providers = plan.entries.map((e) => e.provider);
      expect(providers).not.toContain('no-preview');
    });

    it('应该将 source 设置为 provider-index', () => {
      const index = createTestIndex();
      const plan = planProviderIndexModelCatalogRows({
        index,
        providerFilter: 'moonshot',
      });

      expect(plan.rows[0].source).toBe('provider-index');
    });

    it('应该将未指定的模型状态默认为 preview', () => {
      const index: ProviderIndex = {
        version: 1,
        providers: {
          test: {
            id: 'test',
            name: 'Test',
            plugin: { id: 'test-plugin' },
            previewCatalog: {
              models: [
                { id: 'model-1', name: 'Model 1' },
              ],
            },
          },
        },
      };
      const plan = planProviderIndexModelCatalogRows({ index });
      expect(plan.rows[0].status).toBe('preview');
    });

    it('应该保留显式设置的模型状态', () => {
      const index: ProviderIndex = {
        version: 1,
        providers: {
          test: {
            id: 'test',
            name: 'Test',
            plugin: { id: 'test-plugin' },
            previewCatalog: {
              models: [
                { id: 'model-1', name: 'Model 1', status: 'available' },
              ],
            },
          },
        },
      };
      const plan = planProviderIndexModelCatalogRows({ index });
      expect(plan.rows[0].status).toBe('available');
    });

    it('应该规范化 provider 和 model id', () => {
      const index: ProviderIndex = {
        version: 1,
        providers: {
          'Test-Provider': {
            id: 'Test-Provider',
            name: 'Test Provider',
            plugin: { id: 'test-plugin' },
            previewCatalog: {
              models: [{ id: 'Model-One', name: 'Model One' }],
            },
          },
        },
      };
      const plan = planProviderIndexModelCatalogRows({ index });

      expect(plan.rows[0].provider).toBe('test-provider');
      expect(plan.rows[0].id).toBe('model-one');
      expect(plan.rows[0].ref).toBe('test-provider/model-one');
      expect(plan.rows[0].mergeKey).toBe('test-provider::model-one');
    });

    it('应该设置正确的 ref 和 mergeKey', () => {
      const index = createTestIndex();
      const plan = planProviderIndexModelCatalogRows({
        index,
        providerFilter: 'moonshot',
      });

      expect(plan.rows[0].ref).toBe('moonshot/kimi-k2.6');
      expect(plan.rows[0].mergeKey).toBe('moonshot::kimi-k2.6');
    });

    it('应该按 provider 和 model id 排序行', () => {
      const index = createTestIndex();
      const plan = planProviderIndexModelCatalogRows({ index });

      expect(plan.rows[0].provider).toBe('deepseek');
      expect(plan.rows[1].provider).toBe('moonshot');
    });

    it('应该处理空的 provider 索引', () => {
      const index: ProviderIndex = { version: 1, providers: {} };
      const plan = planProviderIndexModelCatalogRows({ index });

      expect(plan.entries).toHaveLength(0);
      expect(plan.rows).toHaveLength(0);
    });

    it('应该为模型设置默认的 input 值', () => {
      const index: ProviderIndex = {
        version: 1,
        providers: {
          test: {
            id: 'test',
            name: 'Test',
            plugin: { id: 'test-plugin' },
            previewCatalog: {
              models: [{ id: 'model-1' }],
            },
          },
        },
      };
      const plan = planProviderIndexModelCatalogRows({ index });
      expect(plan.rows[0].input).toEqual(['text']);
    });

    it('应该保留上下文窗口大小', () => {
      const index = createTestIndex();
      const plan = planProviderIndexModelCatalogRows({
        index,
        providerFilter: 'moonshot',
      });

      expect(plan.rows[0].contextWindow).toBe(262144);
    });

    it('当 provider 过滤器不匹配时应该返回空结果', () => {
      const index = createTestIndex();
      const plan = planProviderIndexModelCatalogRows({
        index,
        providerFilter: 'nonexistent',
      });

      expect(plan.entries).toHaveLength(0);
      expect(plan.rows).toHaveLength(0);
    });
  });
});
