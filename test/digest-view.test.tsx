import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { ReadNightResult } from '../src/digest/types.js';
import { DigestPage } from '../src/views/digest.js';

async function renderDigest(night: string, digest: ReadNightResult): Promise<string> {
  const app = new Hono();
  app.get('/', (c) => c.html(<DigestPage night={night} digest={digest} />));
  const response = await app.request('/');
  expect(response.status).toBe(200);
  return response.text();
}

describe('digest page', () => {
  it('renders every field in job order, preserving offsets and marking warnings', async () => {
    const digest: ReadNightResult = {
      badLines: 2,
      rows: [
        {
          job: 'z/job',
          owner: 'worker',
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: 'quota exceeded',
          firstAt: '2026-10-01T11:00:00+05:30',
          lastAt: '2026-10-01T11:30:00+05:30',
        },
        {
          job: 'a/job',
          owner: null,
          runs: 4,
          retries: 3,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-01T09:00:00+05:30',
          lastAt: '2026-10-01T09:30:00+05:30',
        },
      ],
    };

    const html = await renderDigest('2026-10-01', digest);

    expect(html).toContain('<h1>digest 2026-10-01</h1>');
    expect(html).toContain('bad lines: 2');
    expect(html.indexOf('a/job')).toBeLessThan(html.indexOf('z/job'));
    expect(html.match(/<td>—<\/td>/g)).toHaveLength(2);
    for (const heading of [
      'job',
      'owner',
      'runs',
      'retries',
      'last status',
      'last error',
      'first time',
      'last time',
    ]) {
      expect(html).toContain(`<th scope="col">${heading}</th>`);
    }
    expect(html).toContain('<td>4</td>');
    expect(html).toContain('<td>1</td>');
    expect(html).toContain('<td class="warn">3</td>');
    expect(html).toContain('<td class="warn">fail</td>');
    expect(html).toContain('<td>quota exceeded</td>');
    expect(html).toContain('2026-10-01T09:00:00+05:30');
    expect(html).toContain('2026-10-01T09:30:00+05:30');
    expect(html).toContain('2026-10-01T11:00:00+05:30');
    expect(html).toContain('2026-10-01T11:30:00+05:30');
  });

  it('says nothing ran when there are no rows', async () => {
    const html = await renderDigest('2026-10-02', { rows: [], badLines: 1 });

    expect(html).toContain('<h1>digest 2026-10-02</h1>');
    expect(html).toContain('bad lines: 1');
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
  });
});
