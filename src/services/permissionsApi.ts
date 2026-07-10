export type Capability =
  | 'screenRecording'
  | 'accessibility'
  | 'inputMonitoring'
  | 'fullDiskAccess'
  | 'microphone'
  | 'camera'
  | 'notifications'
  | 'automation'
  | 'location'
  | 'speechRecognition'
  | 'appleScript';

export interface PermissionStatus {
  [capability: string]: boolean;
}

export interface PermissionStatusResponse {
  available: boolean;
  permissions: PermissionStatus;
  message?: string;
}

export interface PermissionRequestResponse {
  success: boolean;
}

import { request } from './api';

export async function getPermissionStatus(): Promise<PermissionStatusResponse> {
  return request<PermissionStatusResponse>('GET', '/api/permissions/status');
}

export async function requestPermission(capability: Capability): Promise<PermissionRequestResponse> {
  return request<PermissionRequestResponse>('POST', `/api/permissions/request/${capability}`);
}

export async function openPermissionSettings(capability: Capability): Promise<PermissionRequestResponse> {
  return request<PermissionRequestResponse>('POST', `/api/permissions/open-settings/${capability}`);
}

export async function openPermissionManager(): Promise<PermissionRequestResponse> {
  return request<PermissionRequestResponse>('POST', '/api/permissions/open-manager');
}