import type { DigestRow, NightDigest } from '../digest/types.js';

const MANY_RETRIES = 3;

function flagged(r: DigestRow): boolean {
  return r.lastStatus === 'fail' || r.retries >= MANY_RETRIES;
}

export function DigestPage({ night, digest }: { night: string; digest: NightDigest }) {
  return (
    <>
      <h1>digest · {night}</h1>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last</th>
              <th>error</th>
              <th>first</th>
              <th>last time</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((r) => (
              <tr class={flagged(r) ? 'warn' : undefined}>
                <td>{r.job}</td>
                <td>{r.owner ?? '—'}</td>
                <td>{r.runs}</td>
                <td>{r.retries}</td>
                <td>{r.lastStatus}</td>
                <td>{r.lastError ?? ''}</td>
                <td>{r.first}</td>
                <td>{r.last}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {digest.badLines > 0 && <p class="mute">{digest.badLines} unreadable line(s) skipped</p>}
    </>
  );
}
