# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

## Morning digest

- `/digest/2026-10-28` shows the sample night's jobs in job-name order.
- `/api/digest/2026-10-28` returns the same rows as `{ rows, badLines }`.
- `/` links each night to its digest and counts jobs by their last status.
- Missing nights return 404; empty nights display "nothing ran".
- Malformed log lines are counted without preventing the remaining jobs from rendering.

The HTML includes the lane banner. Keep `.env` and saved preview HTML out of git.
Public previews retain their marker until review is in, then must be replaced at
the same URL with a copy generated with `LANE_MARKER` unset (ADR 0003).

Run `pnpm test` and `pnpm typecheck` to validate changes.
