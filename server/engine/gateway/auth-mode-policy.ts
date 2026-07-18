import type { GatewayAuthSurface, GatewayAuthResult } from './auth.js';

export type AuthModePolicy = {
  mode: string;
  surfaces: GatewayAuthSurface[];
  priority: number;
  required: boolean;
};

export type AuthPolicyEvaluation = {
  allowed: boolean;
  mode?: string;
  reason?: string;
  requiredAuth?: string[];
};

const modePolicies = new Map<string, AuthModePolicy>();

export function registerAuthModePolicy(policy: AuthModePolicy): void {
  modePolicies.set(policy.mode, policy);
}

export function unregisterAuthModePolicy(mode: string): void {
  modePolicies.delete(mode);
}

export function getAuthModePolicy(mode: string): AuthModePolicy | undefined {
  return modePolicies.get(mode);
}

export function listAuthModePolicies(): AuthModePolicy[] {
  return Array.from(modePolicies.values()).sort((a, b) => a.priority - b.priority);
}

export function evaluateAuthPolicy(params: {
  authResult: GatewayAuthResult;
  surface: GatewayAuthSurface;
  requiredModes?: string[];
}): AuthPolicyEvaluation {
  const { authResult, surface, requiredModes } = params;

  if (!authResult.ok) {
    return {
      allowed: false,
      reason: authResult.reason ?? 'authentication failed',
    };
  }

  const policy = modePolicies.get(authResult.method);
  if (policy) {
    if (!policy.surfaces.includes(surface)) {
      return {
        allowed: false,
        mode: authResult.method,
        reason: `auth mode ${authResult.method} not allowed on surface ${surface}`,
      };
    }
  }

  if (requiredModes && requiredModes.length > 0) {
    if (!requiredModes.includes(authResult.method)) {
      return {
        allowed: false,
        mode: authResult.method,
        reason: `auth mode ${authResult.method} not in required modes`,
        requiredAuth: requiredModes,
      };
    }
  }

  return {
    allowed: true,
    mode: authResult.method,
  };
}

export function getSupportedAuthModes(surface?: GatewayAuthSurface): string[] {
  const policies = listAuthModePolicies();
  if (!surface) {
    return policies.map((p) => p.mode);
  }
  return policies.filter((p) => p.surfaces.includes(surface)).map((p) => p.mode);
}

export function getRequiredAuthModes(surface: GatewayAuthSurface): string[] {
  return listAuthModePolicies()
    .filter((p) => p.surfaces.includes(surface) && p.required)
    .map((p) => p.mode);
}

registerAuthModePolicy({
  mode: 'none',
  surfaces: ['http', 'ws-control-ui'],
  priority: 100,
  required: false,
});

registerAuthModePolicy({
  mode: 'token',
  surfaces: ['http', 'ws-control-ui'],
  priority: 10,
  required: false,
});

registerAuthModePolicy({
  mode: 'password',
  surfaces: ['http', 'ws-control-ui'],
  priority: 20,
  required: false,
});

registerAuthModePolicy({
  mode: 'trusted-proxy',
  surfaces: ['http', 'ws-control-ui'],
  priority: 5,
  required: false,
});
