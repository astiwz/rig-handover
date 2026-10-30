import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

// Saves one digest page as a static HTML file (plan §3, ADR 0003). LANE_MARKER decides the banner:
// set it for the first copy, leave it unset for the clean copy.
const night = process.argv[2] ?? '2026-10-28';
const out = join('dist', 'preview', 'index.html');

const res = await createApp(loadConfig()).request(`/digest/${night}`);
if (!res.ok) throw new Error(`/digest/${night} returned ${res.status}`);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, await res.text());
console.log(`wrote ${out} (${night}, marker ${process.env.LANE_MARKER?.trim() ? 'set' : 'unset'})`);
