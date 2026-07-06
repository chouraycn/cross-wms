export interface ContractSpecification {
  name: string;
  version: string;
  description?: string;
  interfaces: ContractInterface[];
}

export interface ContractInterface {
  name: string;
  methods: ContractMethod[];
}

export interface ContractMethod {
  name: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  errors?: ContractError[];
}

export interface ContractError {
  code: string;
  message: string;
}

export interface ContractTestResult {
  contractName: string;
  passed: boolean;
  errors: ContractTestError[];
  warnings: string[];
}

export interface ContractTestError {
  interfaceName: string;
  methodName: string;
  error: string;
  details?: Record<string, unknown>;
}

export class ContractValidator {
  validateSpecification(spec: ContractSpecification): ContractTestResult {
    const errors: ContractTestError[] = [];
    const warnings: string[] = [];

    if (!spec.name || typeof spec.name !== 'string') {
      errors.push({
        interfaceName: 'specification',
        methodName: 'name',
        error: 'Contract specification must have a name',
      });
    }

    if (!spec.version || typeof spec.version !== 'string') {
      errors.push({
        interfaceName: 'specification',
        methodName: 'version',
        error: 'Contract specification must have a version',
      });
    }

    if (!spec.interfaces || !Array.isArray(spec.interfaces)) {
      errors.push({
        interfaceName: 'specification',
        methodName: 'interfaces',
        error: 'Contract specification must have interfaces array',
      });
    } else {
      for (const iface of spec.interfaces) {
        if (!iface.name || typeof iface.name !== 'string') {
          errors.push({
            interfaceName: '(unknown)',
            methodName: 'name',
            error: 'Interface must have a name',
          });
        }

        if (!iface.methods || !Array.isArray(iface.methods)) {
          errors.push({
            interfaceName: iface.name || '(unknown)',
            methodName: 'methods',
            error: 'Interface must have methods array',
          });
        } else {
          for (const method of iface.methods) {
            if (!method.name || typeof method.name !== 'string') {
              errors.push({
                interfaceName: iface.name || '(unknown)',
                methodName: '(unknown)',
                error: 'Method must have a name',
              });
            }

            if (!method.inputSchema || typeof method.inputSchema !== 'object') {
              errors.push({
                interfaceName: iface.name || '(unknown)',
                methodName: method.name || '(unknown)',
                error: 'Method must have inputSchema',
              });
            }

            if (!method.outputSchema || typeof method.outputSchema !== 'object') {
              errors.push({
                interfaceName: iface.name || '(unknown)',
                methodName: method.name || '(unknown)',
                error: 'Method must have outputSchema',
              });
            }
          }
        }
      }
    }

    return {
      contractName: spec.name || '(unnamed)',
      passed: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateImplementation(
    spec: ContractSpecification,
    implementation: Record<string, unknown>,
  ): ContractTestResult {
    const errors: ContractTestError[] = [];
    const warnings: string[] = [];

    for (const iface of spec.interfaces) {
      const ifaceImpl = implementation[iface.name];
      if (!ifaceImpl) {
        errors.push({
          interfaceName: iface.name,
          methodName: 'interface',
          error: `Interface ${iface.name} not implemented`,
        });
        continue;
      }

      for (const method of iface.methods) {
        const methodImpl = (ifaceImpl as Record<string, unknown>)[method.name];
        if (!methodImpl) {
          errors.push({
            interfaceName: iface.name,
            methodName: method.name,
            error: `Method ${method.name} not implemented`,
          });
          continue;
        }

        if (typeof methodImpl !== 'function') {
          errors.push({
            interfaceName: iface.name,
            methodName: method.name,
            error: `Method ${method.name} is not a function`,
          });
        }
      }
    }

    return {
      contractName: spec.name,
      passed: errors.length === 0,
      errors,
      warnings,
    };
  }
}

export class ContractTestRunner {
  private validator: ContractValidator;

  constructor() {
    this.validator = new ContractValidator();
  }

  runSpecificationTests(
    specs: ContractSpecification[],
  ): ContractTestResult[] {
    return specs.map(spec => this.validator.validateSpecification(spec));
  }

  runImplementationTests(
    specs: ContractSpecification[],
    implementations: Record<string, Record<string, unknown>>,
  ): ContractTestResult[] {
    const results: ContractTestResult[] = [];

    for (const spec of specs) {
      const impl = implementations[spec.name];
      if (impl) {
        results.push(this.validator.validateImplementation(spec, impl));
      } else {
        results.push({
          contractName: spec.name,
          passed: false,
          errors: [{
            interfaceName: 'implementation',
            methodName: 'missing',
            error: `No implementation found for contract ${spec.name}`,
          }],
          warnings: [],
        });
      }
    }

    return results;
  }

  runAllTests(
    specs: ContractSpecification[],
    implementations: Record<string, Record<string, unknown>>,
  ): { specResults: ContractTestResult[]; implResults: ContractTestResult[] } {
    return {
      specResults: this.runSpecificationTests(specs),
      implResults: this.runImplementationTests(specs, implementations),
    };
  }
}

export function createContract(name: string, version: string, interfaces: ContractInterface[]): ContractSpecification {
  return {
    name,
    version,
    interfaces,
  };
}

export function createInterface(name: string, methods: ContractMethod[]): ContractInterface {
  return {
    name,
    methods,
  };
}

export function createMethod(name: string, inputSchema: Record<string, unknown>, outputSchema: Record<string, unknown>): ContractMethod {
  return {
    name,
    inputSchema,
    outputSchema,
  };
}