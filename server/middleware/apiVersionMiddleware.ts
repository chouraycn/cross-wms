import { Request, Response, NextFunction } from 'express';

/** Adds API version headers to responses */
export function apiVersionMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Determine version from path
  const versionMatch = req.path.match(/^\/api\/(v\d+)\//);
  const version = versionMatch ? versionMatch[1] : 'v1';

  res.setHeader('X-API-Version', version);

  // Add deprecation warning for unversioned requests
  if (!versionMatch && req.path.startsWith('/api/') && !req.path.startsWith('/api/uploads')) {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Link', '</api/v1>; rel="successor-version"');
  }

  next();
}
