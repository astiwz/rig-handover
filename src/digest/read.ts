import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, ReadNightResult } from './types.js';

type RunRecord = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

type JobState = {
  row: DigestRow;
  firstEpoch: number;
  lastEpoch: number;
  lastErrorEpoch: number | null;
};

function isTimestamp(value: string): boolean {
  const isoTimestamp =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!isoTimestamp.test(value)) {
    return false;
  }
  const datePart = value.slice(0, 10);
  const date = new Date(`${datePart}T00:00:00.000Z`);
  return (
    Number.isFinite(Date.parse(value)) &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === datePart
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRecord(line: string): RunRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }

  if (!isObject(value)) return null;
  const { at, job, status, owner, error } = value;
  if (
    typeof at !== 'string' ||
    !isTimestamp(at) ||
    typeof job !== 'string' ||
    job.trim().length === 0 ||
    (status !== 'ok' && status !== 'retry' && status !== 'fail') ||
    !Object.hasOwn(value, 'owner') ||
    (owner !== null && typeof owner !== 'string') ||
    (error !== undefined && typeof error !== 'string')
  ) {
    return null;
  }

  return { at, job, status, owner, ...(error === undefined ? {} : { error }) };
}

function validateNight(night: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) {
    throw new RangeError('night must be a YYYY-MM-DD date');
  }
  const date = new Date(`${night}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== night) {
    throw new RangeError('night must be a valid calendar date');
  }
}

export async function readNight(
  runsDir: string,
  night: string,
): Promise<ReadNightResult | null> {
  validateNight(night);

  let contents: string;
  try {
    contents = await readFile(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }

  const lines = contents === '' ? [] : contents.split(/\r?\n/);
  if (contents.endsWith('\n')) lines.pop();

  const jobs = new Map<string, JobState>();
  let badLines = 0;

  for (const line of lines) {
    const record = parseRecord(line);
    if (!record) {
      badLines += 1;
      continue;
    }

    const epoch = Date.parse(record.at);
    const state = jobs.get(record.job);
    if (!state) {
      jobs.set(record.job, {
        row: {
          job: record.job,
          owner: record.owner,
          runs: 1,
          retries: record.status === 'retry' ? 1 : 0,
          lastStatus: record.status,
          lastError: record.error ?? null,
          firstAt: record.at,
          lastAt: record.at,
        },
        firstEpoch: epoch,
        lastEpoch: epoch,
        lastErrorEpoch: record.error === undefined ? null : epoch,
      });
      continue;
    }

    state.row.runs += 1;
    if (record.status === 'retry') state.row.retries += 1;

    if (epoch < state.firstEpoch) {
      state.firstEpoch = epoch;
      state.row.firstAt = record.at;
    }
    if (epoch >= state.lastEpoch) {
      state.lastEpoch = epoch;
      state.row.lastAt = record.at;
      state.row.lastStatus = record.status;
      state.row.owner = record.owner;
    }
    if (
      record.error !== undefined &&
      (state.lastErrorEpoch === null || epoch >= state.lastErrorEpoch)
    ) {
      state.lastErrorEpoch = epoch;
      state.row.lastError = record.error;
    }
  }

  return {
    rows: [...jobs.values()]
      .map(({ row }) => row)
      .sort((left, right) => left.job.localeCompare(right.job)),
    badLines,
  };
}
