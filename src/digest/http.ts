import { readNight } from './read.js';
import type { ReadNightResult } from './types.js';

export async function loadDigest(
  runsDir: string,
  night: string,
): Promise<ReadNightResult | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  const date = new Date(`${night}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== night) {
    return null;
  }

  const result = await readNight(runsDir, night);
  if (result === null) return null;

  return {
    ...result,
    rows: [...result.rows].sort((left, right) => left.job.localeCompare(right.job)),
  };
}
