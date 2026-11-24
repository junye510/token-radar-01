// token-radar-01 entrypoint (Node 22, standard library only).
//
// Reads the sealed snapshot (--input <file|dir>, default /input/snapshot.json),
// scores every pre-token protocol with the model in lib/model.ts, then emits:
//   board.json    the ranked board ({ rows: [...] } plus a trailing newline)
//   data.js       the same board as a script the static dashboard loads
//   dashboard/    copied from this repository (static page, no network)
//   screenshots/  copied from this repository (the gate wants 3 named images)
//   dossier.json  written last, on purpose: the scorer rebuilds it from the
//                 output directory and compares bytes, so nothing may be
//                 written after it lands.
// MAKEFUN_OUTPUT_DIR stands in for /output outside the grader's container:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));

// Caps from reference/gate.json: the text cap shapes the dossier's bytes,
// the rest are refusals.
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

// Value of a `--name value` or `--name=value` argument, else the fallback.
function arg(name: string, fallback: string): string {
  const args = process.argv;
  const at = args.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < args.length) return args[at + 1]!;
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

// Write a refusal to stderr and stop with the gate's exit code.
function fail(code: number, message: string): never {
  process.stderr.write(message);
  process.exit(code);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  fail(2, `token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
}
const outDir = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  fail(1, `token radar: the model wrote a board the gate refuses: ${issue}\n`);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

// Copy a directory's regular files into `to`, skipping dot-names; returns
// the names copied, in directory order.
function copyFiles(from: string, to: string): string[] {
  const copied: string[] = [];
  if (!existsSync(from)) return copied;
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(repoDir, 'dashboard'), join(outDir, 'dashboard'));
const shots = copyFiles(join(repoDir, 'screenshots'), join(outDir, 'screenshots'));
validateShots(shots);

// The gate's screenshot rules: at least the board, a detail view and a
// filtered view, and every name a plain filename the dossier can carry.
function validateShots(shots: string[]): void {
  if (shots.length < 3) {
    fail(1, `token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  }
  for (const name of shots) {
    if (!IMAGE_NAME.test(name)) {
      fail(1, `token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    }
  }
}

writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')} (3 files), ${join(outDir, 'screenshots')} (${shots.length} images) and ${join(outDir, 'dossier.json')}\n`,
);
