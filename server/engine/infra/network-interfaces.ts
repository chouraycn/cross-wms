import * as os from 'node:os';
import { logger } from '../../logger.js';
import { isPrivateIpAddress } from './ssrf.js';

export type NetworkInterfaceInfo = {
  name: string;
  addresses: NetworkAddressInfo[];
  internal: boolean;
};

export type NetworkAddressInfo = {
  address: string;
  family: 'IPv4' | 'IPv6';
  netmask: string;
  mac: string;
  internal: boolean;
  cidr?: string;
  isPrivate: boolean;
  isLoopback: boolean;
};

export function getNetworkInterfaces(): NetworkInterfaceInfo[] {
  const interfaces = os.networkInterfaces();
  const result: NetworkInterfaceInfo[] = [];

  for (const [name, ifaceList] of Object.entries(interfaces)) {
    if (!ifaceList || ifaceList.length === 0) continue;

    const addresses: NetworkAddressInfo[] = ifaceList.map(iface => {
      const isLoopback = isLoopbackAddress(iface.address, iface.family);
      const isPrivate = isPrivateIp(iface.address);
      
      return {
        address: iface.address,
        family: iface.family as 'IPv4' | 'IPv6',
        netmask: iface.netmask,
        mac: iface.mac,
        internal: iface.internal,
        cidr: iface.cidr ?? undefined,
        isPrivate,
        isLoopback,
      };
    });

    result.push({
      name,
      addresses,
      internal: addresses.every(a => a.internal),
    });
  }

  return result;
}

function isLoopbackAddress(address: string, family: string): boolean {
  if (family === 'IPv4') {
    return address.startsWith('127.');
  }
  if (family === 'IPv6') {
    return address === '::1' || address === '0:0:0:0:0:0:0:1';
  }
  return false;
}

function isPrivateIp(address: string): boolean {
  return isPrivateIpAddress(address);
}

export function getPublicIpAddresses(): string[] {
  const interfaces = getNetworkInterfaces();
  const addresses: string[] = [];

  for (const iface of interfaces) {
    if (iface.internal) continue;
    
    for (const addr of iface.addresses) {
      if (!addr.isPrivate && !addr.isLoopback && !addr.internal) {
        addresses.push(addr.address);
      }
    }
  }

  return addresses;
}

export function getPrivateIpAddresses(): string[] {
  const interfaces = getNetworkInterfaces();
  const addresses: string[] = [];

  for (const iface of interfaces) {
    for (const addr of iface.addresses) {
      if (addr.isPrivate && !addr.isLoopback) {
        addresses.push(addr.address);
      }
    }
  }

  return addresses;
}

export function getIpv4Addresses(): string[] {
  const interfaces = getNetworkInterfaces();
  const addresses: string[] = [];

  for (const iface of interfaces) {
    for (const addr of iface.addresses) {
      if (addr.family === 'IPv4' && !addr.isLoopback) {
        addresses.push(addr.address);
      }
    }
  }

  return addresses;
}

export function getIpv6Addresses(): string[] {
  const interfaces = getNetworkInterfaces();
  const addresses: string[] = [];

  for (const iface of interfaces) {
    for (const addr of iface.addresses) {
      if (addr.family === 'IPv6' && !addr.isLoopback) {
        addresses.push(addr.address);
      }
    }
  }

  return addresses;
}

export function getPrimaryIpAddress(): string | undefined {
  const interfaces = getNetworkInterfaces();
  
  for (const iface of interfaces) {
    if (iface.internal) continue;
    
    for (const addr of iface.addresses) {
      if (addr.family === 'IPv4' && !addr.isLoopback && !addr.internal) {
        return addr.address;
      }
    }
  }
  
  return undefined;
}

export function hasNetworkInterface(name: string): boolean {
  const interfaces = getNetworkInterfaces();
  return interfaces.some(i => i.name === name);
}

export function getNetworkInterface(name: string): NetworkInterfaceInfo | undefined {
  const interfaces = getNetworkInterfaces();
  return interfaces.find(i => i.name === name);
}

export function getHostname(): string {
  return os.hostname();
}

export function getNetworkSummary(): {
  hostname: string;
  interfaces: number;
  ipv4Count: number;
  ipv6Count: number;
  privateIpCount: number;
  publicIpCount: number;
} {
  const interfaces = getNetworkInterfaces();
  let ipv4Count = 0;
  let ipv6Count = 0;
  let privateIpCount = 0;
  let publicIpCount = 0;

  for (const iface of interfaces) {
    for (const addr of iface.addresses) {
      if (addr.family === 'IPv4') ipv4Count++;
      if (addr.family === 'IPv6') ipv6Count++;
      if (addr.isPrivate && !addr.isLoopback) privateIpCount++;
      if (!addr.isPrivate && !addr.isLoopback && !addr.internal) publicIpCount++;
    }
  }

  return {
    hostname: os.hostname(),
    interfaces: interfaces.length,
    ipv4Count,
    ipv6Count,
    privateIpCount,
    publicIpCount,
  };
}
