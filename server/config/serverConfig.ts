const DEFAULT_PORT = 3001;

let currentPort: number | null = null;

export function getServerPort(): number {
  if (currentPort !== null) {
    return currentPort;
  }
  const port = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
  return isNaN(port) ? DEFAULT_PORT : port;
}

export function setServerPort(port: number): void {
  currentPort = port;
}

export function getServerBaseUrl(): string {
  const port = getServerPort();
  return `http://localhost:${port}`;
}

export const ServerConfig = {
  defaultPort: DEFAULT_PORT,
  get port() {
    return getServerPort();
  },
  get baseUrl() {
    return getServerBaseUrl();
  },
};
