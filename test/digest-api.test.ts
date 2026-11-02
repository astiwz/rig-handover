import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RigConfig } from '../src/config.js';
import { registerDigestApi } from '../src/digest/api.js';
import { loadDigest } from '../src/digest/http.js';
import * as reader from '../src/digest/read.js';
import type { DigestRow, ReadNightResult } from '../src/digest/types.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const config: RigConfig = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: join(root, 'runs'),
};

function createApi(runsDir = config.runsDir): Hono {
  const app = new Hono();
  registerDigestApi(app, { ...config, runsDir });
  return app;
}

afterEach(() => vi.restoreAllMocks());

describe('loadDigest', () => {
  it.each([
    '2026-2-01',
    '2026-02-29',
    '2026-04-31',
    '2026-00-01',
    '2026-13-01',
    '2026-01-00',
    '2026-01-32',
    '../2026-10-28',
    '2026-10-28.jsonl',
    '2026-10-28\n',
  ])('rejects invalid night %j before calling the reader', async (night) => {
    const read = vi.spyOn(reader, 'readNight');

    await expect(loadDigest(config.runsDir, night)).resolves.toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it.each(['2024-02-29', '2000-02-29', '2026-12-31'])(
    'accepts calendar date %s',
    async (night) => {
      const read = vi.spyOn(reader, 'readNight').mockResolvedValue(null);

      await expect(loadDigest(config.runsDir, night)).resolves.toBeNull();
      expect(read).toHaveBeenCalledWith(config.runsDir, night);
    },
  );

  it('sorts a copy of the rows without changing the reader result', async () => {
    const row: DigestRow = {
      job: 'z/job',
      owner: null,
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-28T01:00:00+01:00',
      lastAt: '2026-10-28T01:00:00+01:00',
    };
    const source: ReadNightResult = {
      rows: [row, { ...row, job: 'a/job' }],
      badLines: 2,
    };
    vi.spyOn(reader, 'readNight').mockResolvedValue(source);

    const result = await loadDigest(config.runsDir, '2026-10-28');

    expect(result?.rows.map(({ job }) => job)).toEqual(['a/job', 'z/job']);
    expect(result?.badLines).toBe(2);
    expect(result?.rows).not.toBe(source.rows);
    expect(source.rows.map(({ job }) => job)).toEqual(['z/job', 'a/job']);
  });

  it('propagates other I/O errors unchanged', async () => {
    const error = Object.assign(new Error('access denied'), { code: 'EACCES' });
    vi.spyOn(reader, 'readNight').mockRejectedValue(error);

    await expect(loadDigest(config.runsDir, '2026-10-28')).rejects.toBe(error);
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the complete reader result as JSON with jobs sorted', async () => {
    const response = await createApi().request('/api/digest/2026-10-28');
    const result = await response.json() as ReadNightResult;

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(result).toEqual(await loadDigest(config.runsDir, '2026-10-28'));
    expect(result.badLines).toBe(1);
    expect(result.rows.map(({ job }) => job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(result.rows[0].owner).toBeNull();
  });

  it('returns an empty result for an empty night', async () => {
    const response = await createApi(join(root, 'test', 'fixtures'))
      .request('/api/digest/2026-10-31');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ rows: [], badLines: 0 });
  });

  it.each(['1900-01-01', '2026-02-29', 'not-a-date', '2026-10-28.jsonl'])(
    'returns 404 for missing or invalid night %s',
    async (night) => {
      const response = await createApi().request(`/api/digest/${night}`);
      expect(response.status).toBe(404);
    },
  );

  it('passes I/O errors to Hono instead of returning 404', async () => {
    const error = Object.assign(new Error('access denied'), { code: 'EACCES' });
    vi.spyOn(reader, 'readNight').mockRejectedValue(error);
    const app = createApi();
    const onError = vi.fn(() => new Response('I/O failure', { status: 500 }));
    app.onError(onError);

    const response = await app.request('/api/digest/2026-10-28');

    expect(response.status).toBe(500);
    expect(onError).toHaveBeenCalledWith(error, expect.anything());
  });
});
