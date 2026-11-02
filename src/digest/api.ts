import type { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { loadDigest } from './http.js';

export function registerDigestApi(app: Hono, config: RigConfig): void {
  app.get('/api/digest/:night', async (c) => {
    const result = await loadDigest(config.runsDir, c.req.param('night'));
    if (result === null) return c.notFound();
    return c.json(result);
  });
}
