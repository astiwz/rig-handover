export type DigestStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: DigestStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type ReadNightResult = {
  rows: DigestRow[];
  badLines: number;
};

/**
 * Reads <runsDir>/<night>.jsonl, aggregating valid records by job.
 * Returns null when the file does not exist; malformed lines are counted in
 * badLines. Other filesystem errors are rejected.
 */
export declare function readNight(
  runsDir: string,
  night: string,
): Promise<ReadNightResult | null>;
