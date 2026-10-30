export type JobStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl.
export type RunLine = {
  at: string;
  job: string;
  status: JobStatus;
  owner: string | null;
  error?: string;
};

// One row per job in a night.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: JobStatus;
  lastError: string | null;
  first: string;
  last: string;
};

export type NightDigest = {
  rows: DigestRow[];
  badLines: number;
  // Counts of parsed lines by status.
  counts: Record<JobStatus, number>;
};

// Returns null when runs/<night>.jsonl does not exist. Rows are sorted by job.
export declare function readNight(runsDir: string, night: string): NightDigest | null;
