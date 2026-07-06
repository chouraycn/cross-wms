import { describe, it, expect, beforeEach } from 'vitest';
import { ContractRegistry, defineContract } from '../contracts';

describe('ContractRegistry', () => {
  let registry: ContractRegistry;

  beforeEach(() => {
    registry = new ContractRegistry();
  });

  it('should register and retrieve contracts', () => {
    const contract = defineContract({
      id: 'test-contract',
      name: 'Test Contract',
      version: '1.0.0',
      description: 'Test',
      methods: [{ name: 'test', description: 'test method' }],
    });

    registry.registerContract(contract);

    const retrieved = registry.getContract('test-contract');
    expect(retrieved).not.toBeUndefined();
    expect(retrieved?.name).toBe('Test Contract');
  });

  it('should list all contracts', () => {
    registry.registerContract({
      id: 'contract-a',
      name: 'Contract A',
      version: '1.0.0',
      description: 'A',
      methods: [],
    });
    registry.registerContract({
      id: 'contract-b',
      name: 'Contract B',
      version: '1.0.0',
      description: 'B',
      methods: [],
    });

    const contracts = registry.listContracts();
    expect(contracts.length).toBe(2);
  });

  it('should register and call implementations', async () => {
    registry.registerContract({
      id: 'base-contract',
      name: 'Base',
      version: '1.0.0',
      description: 'Base contract',
      methods: [{ name: 'process', description: 'process input', parameters: { input: 'string' }, returns: 'string' }],
    });

    registry.registerImplementation('base-contract', 'process', (...args: unknown[]) => `processed: ${args[0]}`);

    const result = await registry.callMethod('base-contract', 'process', 'test');
    expect(result).toBe('processed: test');
  });

  it('should return undefined for non-existent contract', () => {
    const contract = registry.getContract('non-existent');
    expect(contract).toBeUndefined();
  });
});