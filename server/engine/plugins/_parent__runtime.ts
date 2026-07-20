export interface RuntimeEnv {
  nodeEnv: string;
  isProduction: boolean;
  isDevelopment: boolean;
}

export function getRuntimeEnv(): RuntimeEnv {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isDevelopment: nodeEnv === 'development',
  };
}
