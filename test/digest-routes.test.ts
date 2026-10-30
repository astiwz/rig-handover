import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

let runsDir: string;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'digest-routes-'));
  writeFileSync(join(runsDir, '2026-02-01.jsonl'), '{"at":"2026-02-01T01:00:00+01:00","job":"a","status":"ok","owner":"rook"}\n');
  writeFileSync(join(runsDir, '2026-02-02.jsonl'), '');
  writeFileSync(join(runsDir, '2026-02-03.jsonl'), 'not json\n{"at":"2026-02-03T01:00:00+01:00","job":"b","status":"fail","owner":null}\n');
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

const app = () => createApp({ adapter: 'shim', installed: 'x', beatEverySeconds: 60, runsDir });

describe('GET /digest/:night', () => {
  it('renders a night with rows: 200', async () => {
    const res = await app().request('/digest/2026-02-01');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<td>a</td>');
  });

  it('404 for a night with no file', async () => {
    expect((await app().request('/digest/2026-12-31')).status).toBe(404);
  });

  it('renders "nothing ran" for an empty file', async () => {
    const res = await app().request('/digest/2026-02-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('renders a night with a bad line and notes the skipped line', async () => {
    const res = await app().request('/digest/2026-02-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<td>b</td>');
    expect(html).toContain('1 unreadable line(s) skipped');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the same rows as JSON: 200', async () => {
    const res = await app().request('/api/digest/2026-02-01');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.night).toBe('2026-02-01');
    expect(body.rows.map((r: { job: string }) => r.job)).toEqual(['a']);
  });

  it('404 for a night with no file', async () => {
    expect((await app().request('/api/digest/2026-12-31')).status).toBe(404);
  });

  it('empty night has no rows', async () => {
    const body = await (await app().request('/api/digest/2026-02-02')).json();
    expect(body.rows).toEqual([]);
  });

  it('bad line is counted, not thrown', async () => {
    const body = await (await app().request('/api/digest/2026-02-03')).json();
    expect(body.badLines).toBe(1);
    expect(body.rows[0]).toMatchObject({ job: 'b', owner: null, lastStatus: 'fail' });
  });
});
