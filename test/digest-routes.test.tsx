import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

const night = '2026-11-01';
const fixturePath = fileURLToPath(new URL('../runs/2026-10-28.jsonl', import.meta.url));
const baseConfig = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
};

type DigestResponse = {
  rows: DigestRow[];
  badLines: number;
};

let runsDir: string;

async function writeNight(date: string, contents: string): Promise<void> {
  await writeFile(join(runsDir, `${date}.jsonl`), contents, 'utf8');
}

async function writeMainNight(): Promise<void> {
  const records = [
    {
      at: '2026-11-01T08:00:00+05:30',
      job: 'zeta/fail',
      status: 'fail',
      owner: null,
      error: 'failed',
    },
    {
      at: '2026-11-01T04:30:00+05:30',
      job: 'beta/retry',
      status: 'retry',
      owner: 'ops',
      error: 'temporary',
    },
    {
      at: '2026-11-01T01:00:00-04:00',
      job: 'alpha/ok',
      status: 'ok',
      owner: null,
    },
    {
      at: '2026-11-01T04:31:00+05:30',
      job: 'beta/retry',
      status: 'retry',
      owner: 'ops',
      error: 'temporary',
    },
    {
      at: '2026-11-01T04:32:00+05:30',
      job: 'beta/retry',
      status: 'retry',
      owner: 'ops',
      error: 'temporary',
    },
    {
      at: '2026-11-01T04:33:00+05:30',
      job: 'beta/retry',
      status: 'ok',
      owner: 'ops',
    },
  ];

  await writeNight(night, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
}

function app(runs = runsDir) {
  return createApp({ ...baseConfig, runsDir: runs });
}

describe('digest routes', () => {
  beforeEach(async () => {
    runsDir = await mkdtemp(join(process.cwd(), '.digest-routes-'));
  });

  afterEach(async () => {
    await rm(runsDir, { recursive: true, force: true });
  });

  it('renders the digest heading, missing owners, retry warnings, and failures', async () => {
    await writeMainNight();

    const response = await app().request(`/digest/${night}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toMatch(/<h[1-6]\b[^>]*>\s*digest 2026-11-01\s*<\/h[1-6]>/i);
    expect(html).toMatch(/(?:—|&#(?:x0*2014|8212);|&mdash;)/i);

    const rows = [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
    const retryRow = rows.find((row) => row.includes('beta/retry'));
    const failureRow = rows.find((row) => row.includes('zeta/fail'));
    expect(retryRow).toBeDefined();
    expect(retryRow).toMatch(/class=["'][^"']*\bwarn\b[^"']*["']/i);
    expect(failureRow).toBeDefined();
    expect(failureRow).toMatch(/class=["'][^"']*\bwarn\b[^"']*["']/i);
  });

  it('returns sorted digest rows as JSON and preserves timestamp offsets', async () => {
    await writeMainNight();

    const response = await app().request(`/api/digest/${night}`);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as DigestResponse;

    expect(payload).toEqual({
      rows: [
        {
          job: 'alpha/ok',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-11-01T01:00:00-04:00',
          lastAt: '2026-11-01T01:00:00-04:00',
        },
        {
          job: 'beta/retry',
          owner: 'ops',
          runs: 4,
          retries: 3,
          lastStatus: 'ok',
          lastError: 'temporary',
          firstAt: '2026-11-01T04:30:00+05:30',
          lastAt: '2026-11-01T04:33:00+05:30',
        },
        {
          job: 'zeta/fail',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: 'failed',
          firstAt: '2026-11-01T08:00:00+05:30',
          lastAt: '2026-11-01T08:00:00+05:30',
        },
      ],
      badLines: 0,
    });
  });

  it('renders the same sorted jobs in HTML and JSON', async () => {
    await writeMainNight();

    const [htmlResponse, jsonResponse] = await Promise.all([
      app().request(`/digest/${night}`),
      app().request(`/api/digest/${night}`),
    ]);
    const html = await htmlResponse.text();
    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    const payload = (await jsonResponse.json()) as DigestResponse;
    const htmlRows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].slice(1);
    const htmlJobs = htmlRows.map(([, row]) =>
      row.match(/<td\b[^>]*>([\s\S]*?)<\/td>/i)?.[1]?.replace(/<[^>]*>/g, '').trim(),
    );

    expect(htmlJobs).toEqual(payload.rows.map(({ job }) => job));
  });

  it('returns 404 for a night with no file on both routes', async () => {
    const [htmlResponse, jsonResponse] = await Promise.all([
      app().request('/digest/2026-11-02'),
      app().request('/api/digest/2026-11-02'),
    ]);

    expect(htmlResponse.status).toBe(404);
    expect(jsonResponse.status).toBe(404);
  });

  it('renders an empty night and returns empty JSON rows', async () => {
    await writeNight(night, '');

    const [htmlResponse, jsonResponse] = await Promise.all([
      app().request(`/digest/${night}`),
      app().request(`/api/digest/${night}`),
    ]);
    const html = await htmlResponse.text();

    expect(htmlResponse.status).toBe(200);
    expect(html.toLowerCase()).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    await expect(jsonResponse.json()).resolves.toEqual({ rows: [], badLines: 0 });
  });

  it('counts malformed lines in JSON and renders their count in HTML', async () => {
    await writeNight(
      night,
      [
        'not valid json',
        JSON.stringify({
          at: '2026-11-01T09:00:00+05:30',
          job: 'valid/job',
          status: 'ok',
          owner: 'ops',
        }),
      ].join('\n'),
    );

    const [htmlResponse, jsonResponse] = await Promise.all([
      app().request(`/digest/${night}`),
      app().request(`/api/digest/${night}`),
    ]);
    const html = await htmlResponse.text();

    expect(htmlResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    const payload = (await jsonResponse.json()) as DigestResponse;
    expect(html).toContain('valid/job');
    expect(html).toMatch(
      /(?:bad|invalid|malformed)[^<]{0,40}\b1\b|\b1\b[^<]{0,40}(?:bad|invalid|malformed)/i,
    );
    expect(payload.badLines).toBe(1);
  });

  it('returns 404 for invalid nights and encoded traversal paths', async () => {
    const paths = [
      '/digest/not-a-date',
      '/api/digest/2026-02-30',
      '/digest/2026-11-01.jsonl',
      '/digest/..%2f2026-11-01',
      '/api/digest/%2e%2e%2f2026-11-01',
    ];

    for (const path of paths) {
      expect((await app().request(path)).status, path).toBe(404);
    }
  });

  it('does not modify the checked-in run fixture while serving it', async () => {
    const before = await readFile(fixturePath, 'utf8');
    const response = await app(dirname(fixturePath)).request('/api/digest/2026-10-28');
    const after = await readFile(fixturePath, 'utf8');

    expect(response.status).toBe(200);
    expect(after).toBe(before);
  });
});
