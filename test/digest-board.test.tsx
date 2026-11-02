import { Hono } from 'hono';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as reader from '../src/digest/read.js';
import * as heartbeat from '../src/heartbeat.js';
import { nightsOnDisk, readStatus, type Status } from '../src/status.js';
import { StatusBoard } from '../src/views/status.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: join(root, 'runs'),
};

async function render(status: Status) {
  const app = new Hono();
  app.get('/', (c) => c.html(<StatusBoard status={status} />));
  const response = await app.request('/');
  expect(response.status).toBe(200);
  return response.text();
}

afterEach(() => vi.restoreAllMocks());

describe('digest board links', () => {
  it('links every fixture night newest first with jobs counted by last status', async () => {
    const status = await readStatus(config);
    expect(status.nights).toEqual([
      { night: '2026-10-28', ok: 4, retry: 0, fail: 1 },
      { night: '2026-10-27', ok: 4, retry: 0, fail: 0 },
    ]);

    const html = await render(status);
    expect(html).toContain('jobs by last status (not log-entry totals)');
    expect(html).toMatch(/href="\/digest\/2026-10-28">2026-10-28<\/a> · ok 4 \/ retry 0 \/ fail 1/);
    expect(html).toMatch(/href="\/digest\/2026-10-27">2026-10-27<\/a> · ok 4 \/ retry 0 \/ fail 0/);
    expect(html.indexOf('/digest/2026-10-28')).toBeLessThan(html.indexOf('/digest/2026-10-27'));
  });

  it('counts a retrying job once rather than counting its retry occurrences', async () => {
    vi.spyOn(reader, 'readNight').mockResolvedValue({
      rows: [{
        job: 'still-retrying',
        owner: null,
        runs: 5,
        retries: 5,
        lastStatus: 'retry',
        lastError: 'upstream unavailable',
        firstAt: '2026-10-28T01:00:00+01:00',
        lastAt: '2026-10-28T02:00:00+01:00',
      }],
      badLines: 1,
    });

    const status = await readStatus(config);
    expect(status.nights.every(({ ok, retry, fail }) => ok === 0 && retry === 1 && fail === 0)).toBe(true);
    expect(await render(status)).toContain('ok 0 / retry 1 / fail 0');
  });

  it('keeps empty nights linked with zero counts and excludes directories', async () => {
    const status = await readStatus({ ...config, runsDir: join(root, 'test', 'fixtures') });
    expect(status.nights).toContainEqual({ night: '2026-10-31', ok: 0, retry: 0, fail: 0 });
    expect(await render(status)).toContain('href="/digest/2026-10-31"');
    expect(nightsOnDisk(join(root, 'test', 'fixtures', 'io-error'))).toEqual([]);
  });

  it('preserves metadata, heartbeat and the missing-directory message', async () => {
    const beat = { at: '2026-10-29T14:06:00+01:00', pid: 123, laneId: 'lane-07' };
    vi.spyOn(heartbeat, 'lastBeat').mockReturnValue(beat);
    const status = await readStatus({ ...config, runsDir: join(root, 'test', 'fixtures', 'missing-directory') });
    expect(status).toEqual({ adapter: config.adapter, installed: config.installed, lastBeat: beat, nights: [] });
    const html = await render(status);
    expect(html).toContain(config.adapter);
    expect(html).toContain(config.installed);
    expect(html).toContain(`${beat.at} · pid ${beat.pid}`);
    expect(html).toContain('nothing in runs/');
    expect(await render({ ...status, lastBeat: null })).toContain('<span class="warn">none</span>');
  });

  it('propagates read failures rather than silently dropping a night', async () => {
    const error = new Error('cannot read run log');
    vi.spyOn(reader, 'readNight').mockRejectedValue(error);
    await expect(readStatus(config)).rejects.toBe(error);
  });

  it('reports a file that disappeared after listing', async () => {
    vi.spyOn(reader, 'readNight').mockResolvedValue(null);
    await expect(readStatus(config)).rejects.toThrow('Run log disappeared while reading status:');
  });

  it('propagates directory errors other than a missing directory', async () => {
    await expect(readStatus({ ...config, runsDir: join(config.runsDir, '2026-10-28.jsonl') }))
      .rejects.toMatchObject({ code: 'ENOTDIR' });
  });
});
