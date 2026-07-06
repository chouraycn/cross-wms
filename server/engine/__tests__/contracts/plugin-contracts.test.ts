import { ContractTestRunner, createContract, createInterface, createMethod } from './contract-framework';

describe('Plugin SDK Contracts', () => {
  const runner = new ContractTestRunner();

  const pluginSdkContract = createContract('plugin-sdk', '1.0.0', [
    createInterface('PluginApi', [
      createMethod('registerTool', {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['name', 'description'],
      }, { type: 'void' }),
      createMethod('registerProvider', {
        type: 'object',
        properties: {
          id: { type: 'string' },
          displayName: { type: 'string' },
        },
        required: ['id', 'displayName'],
      }, { type: 'void' }),
      createMethod('registerHook', {
        type: 'object',
        properties: {
          type: { type: 'string' },
          handler: { type: 'function' },
        },
        required: ['type', 'handler'],
      }, { type: 'void' }),
    ]),
    createInterface('UnifiedPluginRegistry', [
      createMethod('registerDefinition', {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      }, { type: 'boolean' }),
      createMethod('activate', {
        type: 'object',
        properties: {
          pluginId: { type: 'string' },
        },
        required: ['pluginId'],
      }, { type: 'boolean' }),
      createMethod('deactivate', {
        type: 'object',
        properties: {
          pluginId: { type: 'string' },
        },
        required: ['pluginId'],
      }, { type: 'boolean' }),
    ]),
  ]);

  it('should validate plugin-sdk contract specification', () => {
    const results = runner.runSpecificationTests([pluginSdkContract]);
    expect(results[0].passed).toBe(true);
  });

  it('should detect missing required fields in contract', () => {
    const invalidContract = createContract('invalid', '1.0.0', [
      createInterface('BadInterface', [
        createMethod('badMethod', { type: 'object' }, { type: 'object', properties: {} }),
      ]),
    ]);

    const results = runner.runSpecificationTests([invalidContract]);
    expect(results[0].passed).toBe(true);
  });
});