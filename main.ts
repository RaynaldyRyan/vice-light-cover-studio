// Vice Light Cover Studio — a gta6-cover-art-01 entry (Node 22, standard library
// only). The app is this directory's app/ folder: plain static files a desktop
// browser loads offline (app/index.html and its ES modules, two OFL fonts and
// four original SVG sample scenes, no network request). This program hands it
// in: it copies app/ and screenshots/ from beside this file to /output and
// writes /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in app/ or 48 MiB of app
// files, in all, or a path under app/ over 1000 bytes: app/ counts beside
// /output's own 1000-entry cap, its screenshots/ and dossier.json).
// Check the caps this program can check before the dossier is written, so a
// bad handoff fails here with a plain message instead of at the gate: the
// screenshots must be 3 or 4, each at most 256 KiB, and the dossier at most
// 1.5 MiB once written.
const shotDir = join(here, 'screenshots');
const shotFiles = existsSync(shotDir)
  ? readdirSync(shotDir).filter((f) => !f.startsWith('.'))
  : [];
if (shotFiles.length < 3 || shotFiles.length > 4) {
  throw new Error(`handoff refused: ${shotFiles.length} screenshot(s), the gate wants 3 or 4`);
}
for (const f of shotFiles) {
  const bytes = statSync(join(shotDir, f)).size;
  if (bytes > 262144) throw new Error(`handoff refused: screenshot ${f} is ${bytes} bytes, over the 256 KiB cap`);
}
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);
const dossierBytes0 = statSync(join(out, 'dossier.json')).size;
if (dossierBytes0 > 1572864) throw new Error(`handoff refused: dossier.json is ${dossierBytes0} bytes, over the 1.5 MiB cap`);

// Report what was handed in, so a run's result is checkable at a glance: the
// screenshot count and the dossier size the gate caps at 1.5 MiB.
const shots = existsSync(join(out, 'screenshots'))
  ? readdirSync(join(out, 'screenshots')).filter((f) => !f.startsWith('.'))
  : [];
const dossierBytes = statSync(join(out, 'dossier.json')).size;
console.log(`Vice Light Cover Studio handed in: ${shots.length} screenshot(s) [${shots.join(', ')}], dossier.json ${dossierBytes} bytes.`);
