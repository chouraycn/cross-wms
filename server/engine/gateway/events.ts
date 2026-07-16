export const GATEWAY_EVENT_UPDATE_AVAILABLE = 'update.available';

export type UpdateAvailableEventData = {
  currentVersion: string;
  latestVersion: string;
  channel: string;
};

export type GatewayUpdateAvailableEventPayload = {
  updateAvailable: UpdateAvailableEventData | null;
};
