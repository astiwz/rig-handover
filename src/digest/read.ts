import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, JobStatus, NightDigest, RunLine } from './types.js';

const STATUSES: JobStatus[] = ['ok', 'retry', 'fail'];

function parseLine(text: string): RunLine | null {
  try {
    const v = JSON.parse(text);
    if (typeof v !== 'object' || v === null) return null;
    if (typeof v.at !== 'string' || typeof v.job !== 'string') return null;
    if (!STATUSES.includes(v.status)) return null;
    if (v.owner !== null && typeof v.owner !== 'string') return null;
    return v as RunLine;
  } catch {
    return null;
  }
}

export function readNight(runsDir: string, night: string): NightDigest | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  const file = join(runsDir, `${night}.jsonl`);
  if (!existsSync(file)) return null;

  const byJob = new Map<string, DigestRow>();
  const counts: Record<JobStatus, number> = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines++;
      continue;
    }
    counts[line.status]++;
    const row = byJob.get(line.job) ?? {
      job: line.job,
      owner: null,
      runs: 0,
      retries: 0,
      lastStatus: line.status,
      lastError: null,
      first: line.at,
      last: line.at,
    };
    row.runs++;
    if (line.status === 'retry') row.retries++;
    row.lastStatus = line.status;
    row.last = line.at;
    if (line.owner !== null) row.owner = line.owner;
    if (line.error) row.lastError = line.error;
    byJob.set(line.job, row);
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { rows, badLines, counts };
}
