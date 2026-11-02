import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import { lastBeat, type Beat } from './heartbeat.js';

// Counts are jobs by last status, not historical log-entry totals: the reader
// retains retry totals but cannot recover separate historical ok/fail totals.
export type NightStatus = {
  night: string;
  ok: number;
  retry: number;
  fail: number;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightStatus[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir, { withFileTypes: true })
      .filter((f) => f.isFile() && /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f.name))
      .map((f) => f.name.slice(0, 10))
      .sort()
      .reverse();
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return [];
    }
    throw error;
  }
}

export async function readStatus(config: RigConfig): Promise<Status> {
  const nights = await Promise.all(nightsOnDisk(config.runsDir).map(async (night) => {
    const digest = await readNight(config.runsDir, night);
    if (digest === null) {
      throw new Error(`Run log disappeared while reading status: ${night}`);
    }
    const counts: NightStatus = { night, ok: 0, retry: 0, fail: 0 };
    for (const row of digest.rows) {
      counts[row.lastStatus] += 1;
    }
    return counts;
  }));

  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights,
  };
}
