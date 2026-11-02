import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const runsDir = join(root, 'runs');
const edgeCasesDir = join(root, 'test', 'fixtures');
const ioErrorRunsDir = join(edgeCasesDir, 'io-error');

describe('readNight', () => {
  it('aggregates the 2026-10-28 fixture and counts its malformed line', async () => {
    const result = await readNight(runsDir, '2026-10-28');

    expect(result).not.toBeNull();
    expect(result?.badLines).toBe(1);
    expect(result?.rows).toHaveLength(5);
    expect(result?.rows.map(({ job }) => job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);

    const refresh = result?.rows.find(({ job }) => job === 'fixtures/refresh');
    expect(refresh).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(result?.rows.find(({ job }) => job === 'digest/render')?.owner).toBeNull();
  });

  it('keeps offsets and aggregates by timestamp, including nullable owners', async () => {
    const result = await readNight(edgeCasesDir, '2026-10-30');

    expect(result?.badLines).toBe(2);
    expect(result?.rows).toEqual([
      {
        job: 'job/a',
        owner: 'worker',
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-01T09:00:00+05:30',
        lastAt: '2026-10-01T09:00:00+05:30',
      },
      {
        job: 'job/b',
        owner: 'worker',
        runs: 2,
        retries: 1,
        lastStatus: 'ok',
        lastError: 'first issue',
        firstAt: '2026-10-01T10:00:00+05:30',
        lastAt: '2026-10-01T10:30:00+05:30',
      },
      {
        job: 'job/c',
        owner: null,
        runs: 1,
        retries: 0,
        lastStatus: 'fail',
        lastError: 'quota exceeded',
        firstAt: '2026-10-01T11:00:00+05:30',
        lastAt: '2026-10-01T11:00:00+05:30',
      },
    ]);
  });

  it('returns an empty result for an empty file', async () => {
    await expect(readNight(edgeCasesDir, '2026-10-31')).resolves.toEqual({
      rows: [],
      badLines: 0,
    });
  });

  it('returns null only when the requested file does not exist', async () => {
    await expect(readNight(join(edgeCasesDir, 'missing-directory'), '2026-11-01'))
      .resolves.toBeNull();

    await expect(readNight(runsDir, '2026-10-27.jsonl'))
      .rejects.toBeInstanceOf(RangeError);
    await expect(readNight(ioErrorRunsDir, '2026-11-02'))
      .rejects.toMatchObject({ code: 'EISDIR' });
  });
});
