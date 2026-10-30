import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const runs = 'runs';

describe('readNight', () => {
  it('reads the 2026-10-28 night: 5 jobs, 1 bad line', () => {
    const d = readNight(runs, '2026-10-28');
    expect(d).not.toBeNull();
    expect(d!.badLines).toBe(1);
    expect(d!.rows.map((r) => r.job)).toEqual(['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']);
  });

  it('counts runs and retries per job', () => {
    const sync = readNight(runs, '2026-10-28')!.rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(sync.runs).toBe(4);
    expect(sync.retries).toBe(3);
    expect(sync.lastStatus).toBe('ok');
  });

  it('returns null for a night with no file, and for a bad night string', () => {
    expect(readNight(runs, '1999-01-01')).toBeNull();
    expect(readNight(runs, '../runs/2026-10-28')).toBeNull();
  });

  describe('temp runs dir', () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'digest-'));
    });
    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('keeps a row with a null owner and returns an empty night', () => {
      writeFileSync(join(dir, '2026-01-02.jsonl'), '{"at":"2026-01-02T01:00:00+01:00","job":"a","status":"fail","owner":null,"error":"boom"}\n');
      writeFileSync(join(dir, '2026-01-03.jsonl'), '');
      const one = readNight(dir, '2026-01-02')!;
      expect(one.rows[0]).toMatchObject({ job: 'a', owner: null, lastStatus: 'fail', lastError: 'boom' });
      expect(readNight(dir, '2026-01-03')).toEqual({ rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
    });

    it('counts a non-JSON line and an unknown status as bad, never throws', () => {
      writeFileSync(join(dir, '2026-01-04.jsonl'), 'not json\n{"at":"x","job":"b","status":"weird","owner":"rook"}\n{"at":"x","job":"b","status":"ok","owner":"rook"}\n');
      const d = readNight(dir, '2026-01-04')!;
      expect(d.badLines).toBe(2);
      expect(d.rows).toHaveLength(1);
    });
  });
});
