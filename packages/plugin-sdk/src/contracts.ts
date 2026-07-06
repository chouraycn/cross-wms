import EventEmitter from 'eventemitter3';
import type { PluginContract, ContractMethod } from './types';

export interface ContractRegistryEvents {
  contract_registered: [contract: PluginContract];
  contract_unregistered: [contractId: string];
  contract_method_called: [contractId: string, method: string, args: unknown[]];
}

export class ContractRegistry extends EventEmitter<ContractRegistryEvents> {
  private contracts: Map<string, PluginContract> = new Map();
  private implementations: Map<string, Map<string, (...args: unknown[]) => unknown>> = new Map();

  registerContract(contract: PluginContract): void {
    if (this.contracts.has(contract.id)) {
      throw new Error(`Contract ${contract.id} already registered`);
    }
    this.contracts.set(contract.id, contract);
    this.implementations.set(contract.id, new Map());
    this.emit('contract_registered', contract);
  }

  unregisterContract(contractId: string): boolean {
    const existed = this.contracts.delete(contractId);
    this.implementations.delete(contractId);
    if (existed) {
      this.emit('contract_unregistered', contractId);
    }
    return existed;
  }

  getContract(contractId: string): PluginContract | undefined {
    return this.contracts.get(contractId);
  }

  listContracts(): PluginContract[] {
    return Array.from(this.contracts.values());
  }

  hasContract(contractId: string): boolean {
    return this.contracts.has(contractId);
  }

  registerImplementation(
    contractId: string,
    methodName: string,
    impl: (...args: unknown[]) => unknown,
  ): void {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    const method = contract.methods.find((m: ContractMethod) => m.name === methodName);
    if (!method) {
      throw new Error(`Method ${methodName} not found in contract ${contractId}`);
    }

    const implMap = this.implementations.get(contractId);
    if (!implMap) {
      throw new Error(`Implementation map for ${contractId} not found`);
    }
    implMap.set(methodName, impl);
  }

  async callMethod(
    contractId: string,
    methodName: string,
    ...args: unknown[]
  ): Promise<unknown> {
    const implMap = this.implementations.get(contractId);
    if (!implMap) {
      throw new Error(`Contract ${contractId} not found`);
    }

    const impl = implMap.get(methodName);
    if (!impl) {
      throw new Error(`Method ${methodName} not implemented for contract ${contractId}`);
    }

    this.emit('contract_method_called', contractId, methodName, args);

    const result = impl(...args);
    return result instanceof Promise ? await result : result;
  }

  hasImplementation(contractId: string, methodName: string): boolean {
    const implMap = this.implementations.get(contractId);
    return !!implMap && implMap.has(methodName);
  }

  listImplementations(contractId: string): string[] {
    const implMap = this.implementations.get(contractId);
    return implMap ? Array.from(implMap.keys()) : [];
  }

  clear(): void {
    this.contracts.clear();
    this.implementations.clear();
  }
}

export const contractRegistry = new ContractRegistry();

export function defineContract(contract: PluginContract): PluginContract {
  return contract;
}

export function implementsContract(
  contractId: string,
  methods: Record<string, (...args: unknown[]) => unknown>,
): void {
  for (const [methodName, impl] of Object.entries(methods)) {
    contractRegistry.registerImplementation(contractId, methodName, impl);
  }
}
