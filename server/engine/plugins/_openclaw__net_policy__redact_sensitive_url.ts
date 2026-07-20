const SENSITIVE_PARAMS = ['key', 'secret', 'token', 'password', 'api_key', 'apikey', 'access_token', 'auth_token'];

export function redactSensitiveUrlLikeString(url: string): string {
  return url.replace(/([?&])([^=]+)=([^&]*)/g, (match, prefix, param, value) => {
    if (SENSITIVE_PARAMS.includes(param.toLowerCase())) {
      return `${prefix}${param}=***`;
    }
    return match;
  });
}
