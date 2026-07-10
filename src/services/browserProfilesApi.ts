import { request } from './api';

export interface BrowserProfile {
  id: string;
  name: string;
  userDataDir?: string;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateProfilePayload {
  name: string;
  userDataDir?: string;
}

export async function listProfiles(): Promise<BrowserProfile[]> {
  return request<BrowserProfile[]>('GET', '/api/browser/profiles');
}

export async function createProfile(data: CreateProfilePayload): Promise<BrowserProfile> {
  return request<BrowserProfile>('POST', '/api/browser/profiles', data);
}

export async function deleteProfile(id: string): Promise<void> {
  await request<void>('DELETE', `/api/browser/profiles/${encodeURIComponent(id)}`);
}

export async function setDefaultProfile(id: string): Promise<void> {
  await request<void>('PUT', `/api/browser/profiles/${encodeURIComponent(id)}/default`);
}