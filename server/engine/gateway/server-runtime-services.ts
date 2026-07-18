import { logger } from '../../logger.js';

export type RuntimeService = {
  name: string;
  start: () => Promise<void> | void;
  stop: () => Promise<void> | void;
  status: () => RuntimeServiceStatus;
  dependsOn?: string[];
  metadata?: Record<string, unknown>;
};

export type RuntimeServiceStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export type ServiceRegistry = Map<string, RuntimeService>;

const services: ServiceRegistry = new Map();
const serviceStatus = new Map<string, RuntimeServiceStatus>();

export function registerService(service: RuntimeService): void {
  services.set(service.name, service);
  serviceStatus.set(service.name, 'stopped');
  logger.debug(`[Gateway] Service registered: ${service.name}`);
}

export function unregisterService(name: string): boolean {
  const service = services.get(name);
  if (!service) return false;

  if (serviceStatus.get(name) === 'running') {
    logger.warn(`[Gateway] Unregistering running service: ${name}`);
  }

  services.delete(name);
  serviceStatus.delete(name);
  return true;
}

export function getService(name: string): RuntimeService | undefined {
  return services.get(name);
}

export function getServiceStatus(name: string): RuntimeServiceStatus | undefined {
  return serviceStatus.get(name);
}

export function listServices(): string[] {
  return Array.from(services.keys());
}

export async function startService(name: string): Promise<void> {
  const service = services.get(name);
  if (!service) {
    throw new Error(`Service not found: ${name}`);
  }

  const currentStatus = serviceStatus.get(name);
  if (currentStatus === 'running' || currentStatus === 'starting') {
    logger.debug(`[Gateway] Service already running: ${name}`);
    return;
  }

  if (service.dependsOn && service.dependsOn.length > 0) {
    for (const dep of service.dependsOn) {
      if (serviceStatus.get(dep) !== 'running') {
        logger.debug(`[Gateway] Starting dependency: ${dep}`);
        await startService(dep);
      }
    }
  }

  logger.info(`[Gateway] Starting service: ${name}`);
  serviceStatus.set(name, 'starting');

  try {
    await Promise.resolve(service.start());
    serviceStatus.set(name, 'running');
    logger.info(`[Gateway] Service started: ${name}`);
  } catch (err) {
    serviceStatus.set(name, 'error');
    logger.error(`[Gateway] Service failed to start: ${name}`, err);
    throw err;
  }
}

export async function stopService(name: string): Promise<void> {
  const service = services.get(name);
  if (!service) {
    throw new Error(`Service not found: ${name}`);
  }

  const currentStatus = serviceStatus.get(name);
  if (currentStatus === 'stopped' || currentStatus === 'stopping') {
    logger.debug(`[Gateway] Service already stopped: ${name}`);
    return;
  }

  logger.info(`[Gateway] Stopping service: ${name}`);
  serviceStatus.set(name, 'stopping');

  try {
    await Promise.resolve(service.stop());
    serviceStatus.set(name, 'stopped');
    logger.info(`[Gateway] Service stopped: ${name}`);
  } catch (err) {
    serviceStatus.set(name, 'error');
    logger.error(`[Gateway] Service failed to stop: ${name}`, err);
    throw err;
  }
}

export async function startAllServices(): Promise<void> {
  logger.info('[Gateway] Starting all services...');
  const serviceList = Array.from(services.values());

  const started = new Set<string>();
  const starting = new Set<string>();

  async function startWithDeps(service: RuntimeService): Promise<void> {
    if (started.has(service.name)) return;
    if (starting.has(service.name)) return;

    starting.add(service.name);

    if (service.dependsOn) {
      for (const dep of service.dependsOn) {
        const depService = services.get(dep);
        if (depService) {
          await startWithDeps(depService);
        }
      }
    }

    await startService(service.name);
    started.add(service.name);
    starting.delete(service.name);
  }

  for (const service of serviceList) {
    await startWithDeps(service);
  }

  logger.info('[Gateway] All services started');
}

export async function stopAllServices(): Promise<void> {
  logger.info('[Gateway] Stopping all services...');
  const serviceList = Array.from(services.values()).reverse();

  for (const service of serviceList) {
    try {
      await stopService(service.name);
    } catch (err) {
      logger.error(`[Gateway] Error stopping service ${service.name}:`, err);
    }
  }

  logger.info('[Gateway] All services stopped');
}

export function getServicesStatus(): Record<string, RuntimeServiceStatus> {
  const result: Record<string, RuntimeServiceStatus> = {};
  for (const [name, status] of serviceStatus.entries()) {
    result[name] = status;
  }
  return result;
}

export function clearServices(): void {
  services.clear();
  serviceStatus.clear();
}
