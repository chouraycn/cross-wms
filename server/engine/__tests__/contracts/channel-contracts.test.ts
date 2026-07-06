import { ContractTestRunner, createContract, createInterface, createMethod } from './contract-framework';

describe('Channel Contracts', () => {
  const runner = new ContractTestRunner();

  const channelContract = createContract('channel', '1.0.0', [
    createInterface('ChannelAdapter', [
      createMethod('connect', {}, { type: 'void' }),
      createMethod('disconnect', {}, { type: 'void' }),
      createMethod('isConnected', {}, { type: 'boolean' }),
      createMethod('sendMessage', {
        type: 'object',
        properties: {
          id: { type: 'string' },
          content: { type: 'string' },
          channelId: { type: 'string' },
          accountId: { type: 'string' },
        },
        required: ['id', 'content', 'channelId', 'accountId'],
      }, {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          messageId: { type: 'string' },
          error: { type: 'string' },
        },
        required: ['success'],
      }),
      createMethod('receiveMessages', {}, { type: 'array' }),
    ]),
    createInterface('ChannelAdapterFactory', [
      createMethod('create', {
        type: 'object',
        properties: {
          channelId: { type: 'string' },
          accountId: { type: 'string' },
          config: { type: 'object' },
        },
        required: ['channelId', 'accountId', 'config'],
      }, { type: 'object' }),
      createMethod('getChannelId', {}, { type: 'string' }),
      createMethod('getChannelMeta', {}, {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
        },
        required: ['id', 'label'],
      }),
    ]),
  ]);

  it('should validate channel contract specification', () => {
    const results = runner.runSpecificationTests([channelContract]);
    expect(results[0].passed).toBe(true);
  });
});