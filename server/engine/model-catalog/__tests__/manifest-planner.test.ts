import { describe, expect, it } from 'vitest';
import {
  planManifestModelCatalogRows,
  planManifestModelCatalogSuppressions,
} from '../manifest-planner';

describe('manifest-planner', () => {
  describe('planManifestModelCatalogRows', () => {
    it('应该从 plugin 拥有的 catalog provider 构建行', () => {
      const plan = planManifestModelCatalogRows({
        registry: {
          plugins: [
            {
              id: 'test-plugin',
              providers: ['test-provider'],
              modelCatalog: {
                providers: {
                  'test-provider': {
                    api: 'openai-responses',
                    baseUrl: 'https://api.test.com/v1',
                    models: [
                      {
                        id: 'model-1',
                        name: 'Model 1',
                        input: ['text', 'image'],
                        contextWindow: 256000,
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      });

      expect(plan.entries).toHaveLength(1);
      expect(plan.entries[0].pluginId).toBe('test-plugin');
      expect(plan.entries[0].provider).toBe('test-provider');
      expect(plan.entries[0].rows).toHaveLength(1);
      expect(plan.rows).toHaveLength(1);
      expect(plan.conflicts).toHaveLength(0);

      const row = plan.rows[0];
      expect(row.id).toBe('model-1');
      expect(row.provider).toBe('test-provider');
      expect(row.source).toBe('manifest');
      expect(row.api).toBe('openai-responses');
      expect(row.baseUrl).toBe('https://api.test.com/v1');
      expect(row.contextWindow).toBe(256000);
    });

    it('应该在规划行之前过滤 provider', () => {
      const plan = planManifestModelCatalogRows({
        providerFilter: 'provider-2',
        registry: {
          plugins: [
            {
              id: 'plugin-1',
              providers: ['provider-1'],
              modelCatalog: {
                providers: {
                  'provider-1': {
                    models: [{ id: 'model-1' }],
                  },
                },
              },
            },
            {
              id: 'plugin-2',
              providers: ['provider-2'],
              modelCatalog: {
                providers: {
                  'provider-2': {
                    models: [{ id: 'model-2' }],
                  },
                },
              },
            },
          ],
        },
      });

      expect(plan.entries.map((e) => e.pluginId)).toEqual(['plugin-2']);
      expect(plan.rows.map((r) => r.ref)).toEqual(['provider-2/model-2']);
    });

    it('应该检测冲突并丢弃冲突的行', () => {
      const plan = planManifestModelCatalogRows({
        registry: {
          plugins: [
            {
              id: 'plugin-1',
              providers: ['shared-provider'],
              modelCatalog: {
                providers: {
                  'shared-provider': {
                    models: [{ id: 'conflict-model' }],
                  },
                },
              },
            },
            {
              id: 'plugin-2',
              providers: ['shared-provider'],
              modelCatalog: {
                providers: {
                  'shared-provider': {
                    models: [{ id: 'conflict-model' }],
                  },
                },
              },
            },
          ],
        },
      });

      expect(plan.conflicts).toHaveLength(1);
      expect(plan.conflicts[0].firstPluginId).toBe('plugin-1');
      expect(plan.conflicts[0].secondPluginId).toBe('plugin-2');
      expect(plan.rows).toHaveLength(0);
    });

    it('应该对行进行排序', () => {
      const plan = planManifestModelCatalogRows({
        registry: {
          plugins: [
            {
              id: 'test-plugin',
              providers: ['z-provider', 'a-provider'],
              modelCatalog: {
                providers: {
                  'z-provider': {
                    models: [{ id: 'z-model' }],
                  },
                  'a-provider': {
                    models: [{ id: 'a-model' }],
                  },
                },
              },
            },
          ],
        },
      });

      expect(plan.rows[0].provider).toBe('a-provider');
      expect(plan.rows[1].provider).toBe('z-provider');
    });

    it('应该规范化 provider 和 model id', () => {
      const plan = planManifestModelCatalogRows({
        registry: {
          plugins: [
            {
              id: 'test-plugin',
              providers: ['Test-Provider'],
              modelCatalog: {
                providers: {
                  'Test-Provider': {
                    models: [{ id: 'Model-1' }],
                  },
                },
              },
            },
          ],
        },
      });

      expect(plan.rows[0].provider).toBe('test-provider');
      expect(plan.rows[0].id).toBe('model-1');
      expect(plan.rows[0].ref).toBe('test-provider/model-1');
      expect(plan.rows[0].mergeKey).toBe('test-provider::model-1');
    });

    it('应该为模型设置默认值', () => {
      const plan = planManifestModelCatalogRows({
        registry: {
          plugins: [
            {
              id: 'test-plugin',
              providers: ['test-provider'],
              modelCatalog: {
                providers: {
                  'test-provider': {
                    models: [{ id: 'minimal-model' }],
                  },
                },
              },
            },
          ],
        },
      });

      const row = plan.rows[0];
      expect(row.name).toBe('minimal-model');
      expect(row.input).toEqual(['text']);
      expect(row.reasoning).toBe(false);
      expect(row.status).toBe('available');
    });

    it('应该处理空的插件列表', () => {
      const plan = planManifestModelCatalogRows({
        registry: { plugins: [] },
      });

      expect(plan.entries).toHaveLength(0);
      expect(plan.rows).toHaveLength(0);
      expect(plan.conflicts).toHaveLength(0);
    });
  });

  describe('planManifestModelCatalogSuppressions', () => {
    it('应该从插件清单中规划 suppressions', () => {
      const plan = planManifestModelCatalogSuppressions({
        registry: {
          plugins: [
            {
              id: 'test-plugin',
              providers: ['test-provider'],
              modelCatalog: {
                providers: {
                  'test-provider': { models: [{ id: 'kept-model' }] },
                },
                suppressions: [
                  {
                    provider: 'test-provider',
                    model: 'deprecated-model',
                    reason: 'deprecated',
                    when: 'deprecated',
                  },
                ],
              },
            },
          ],
        },
      });

      expect(plan.suppressions).toHaveLength(1);
      expect(plan.suppressions[0].pluginId).toBe('test-plugin');
      expect(plan.suppressions[0].provider).toBe('test-provider');
      expect(plan.suppressions[0].model).toBe('deprecated-model');
      expect(plan.suppressions[0].reason).toBe('deprecated');
      expect(plan.suppressions[0].when).toBe('deprecated');
    });

    it('应该按 provider 和 model 过滤 suppressions', () => {
      const plan = planManifestModelCatalogSuppressions({
        providerFilter: 'provider-1',
        modelFilter: 'model-a',
        registry: {
          plugins: [
            {
              id: 'plugin-1',
              providers: ['provider-1'],
              modelCatalog: {
                providers: { 'provider-1': { models: [] } },
                suppressions: [
                  { provider: 'provider-1', model: 'model-a' },
                  { provider: 'provider-1', model: 'model-b' },
                  { provider: 'provider-2', model: 'model-a' },
                ],
              },
            },
          ],
        },
      });

      expect(plan.suppressions).toHaveLength(1);
      expect(plan.suppressions[0].model).toBe('model-a');
    });

    it('应该跳过非拥有 provider 的 suppressions', () => {
      const plan = planManifestModelCatalogSuppressions({
        registry: {
          plugins: [
            {
              id: 'plugin-1',
              providers: ['owned-provider'],
              modelCatalog: {
                providers: { 'owned-provider': { models: [] } },
                suppressions: [
                  { provider: 'owned-provider', model: 'model-1' },
                  { provider: 'other-provider', model: 'model-2' },
                ],
              },
            },
          ],
        },
      });

      expect(plan.suppressions).toHaveLength(1);
      expect(plan.suppressions[0].provider).toBe('owned-provider');
    });

    it('应该对 suppressions 进行排序', () => {
      const plan = planManifestModelCatalogSuppressions({
        registry: {
          plugins: [
            {
              id: 'plugin-a',
              providers: ['z-provider', 'a-provider'],
              modelCatalog: {
                providers: {
                  'z-provider': { models: [] },
                  'a-provider': { models: [] },
                },
                suppressions: [
                  { provider: 'z-provider', model: 'z-model' },
                  { provider: 'a-provider', model: 'a-model' },
                ],
              },
            },
          ],
        },
      });

      expect(plan.suppressions[0].provider).toBe('a-provider');
      expect(plan.suppressions[1].provider).toBe('z-provider');
    });

    it('应该处理空的 suppressions', () => {
      const plan = planManifestModelCatalogSuppressions({
        registry: {
          plugins: [
            {
              id: 'test-plugin',
              providers: ['test-provider'],
              modelCatalog: {
                providers: { 'test-provider': { models: [] } },
              },
            },
          ],
        },
      });

      expect(plan.suppressions).toHaveLength(0);
    });
  });
});
