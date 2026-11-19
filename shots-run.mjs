// Maker tool: renders the dossier screenshots headlessly and writes them
// into screenshots/ as JPEGs. Serves app/ with serve.ts, screenshots each
// scenario from app/src/shots.js with the Playwright-cached headless
// Chrome shell, then converts PNG to JPEG with Pillow. Run from this repo:
//   node shots-run.mjs
// Requires: node, python3 + Pillow, the chrome-headless-shell binary from
// the Playwright cache. Screenshots only — it never touches the entry's
// app code, and it is not part of the handed-in entry (main.ts does not
// copy it to /output).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS, shotQuery } from './app/src/shots.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const PORT = 8901;
const CHROME = join(
  homedir(),
  '.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell',
);
const MAX_BYTES = 262144;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error(`server did not come up at ${url}`);
}

function toJpeg(pngPath, jpgPath) {
  // Try qualities until the file fits the 256 KiB screenshot cap.
  for (const quality of [85, 75, 65, 55]) {
    execFileSync('python3', [
      '-c',
      'import sys; from PIL import Image; '
        + 'im = Image.open(sys.argv[1]).convert("RGB"); '
        + 'im.save(sys.argv[2], "JPEG", quality=int(sys.argv[3]))',
      pngPath,
      jpgPath,
      String(quality),
    ]);
    const { size } = statSync(jpgPath);
    if (size <= MAX_BYTES) return { quality, bytes: size };
  }
  const { size } = statSync(jpgPath);
  return { quality: 55, bytes: size };
}

async function main() {
  const shotsDir = join(here, 'screenshots');
  mkdirSync(shotsDir, { recursive: true });

  const server = spawn('node', ['serve.ts', '--port', String(PORT)], {
    cwd: here,
    stdio: 'ignore',
  });
  try {
    await waitForServer(`http://localhost:${PORT}/`);
    for (const shot of SHOTS) {
      const png = join(shotsDir, `.${shot.file}.png`);
      const jpg = join(shotsDir, shot.file);
      const url = `http://localhost:${PORT}/${shotQuery(shot)}`;
      execFileSync(
        CHROME,
        [
          '--headless',
          '--disable-gpu',
          '--no-sandbox',
          '--hide-scrollbars',
          '--force-device-scale-factor=1',
          `--window-size=${shot.w},${shot.h}`,
          '--virtual-time-budget=12000',
          `--screenshot=${png}`,
          url,
        ],
        { stdio: 'inherit', timeout: 120000 },
      );
      const { quality, bytes } = toJpeg(png, jpg);
      rmSync(png);
      // Verify the JPEG's dimensions and size against the gate's caps.
      const dims = execFileSync(
        'python3',
        [
          '-c',
          'import sys; from PIL import Image; '
            + 'im = Image.open(sys.argv[1]); print(f"{im.width}x{im.height}")',
          jpg,
        ],
        { encoding: 'utf8' },
      ).trim();
      console.log(`${shot.file}: ${dims}, ${bytes} bytes (jpeg q${quality})`);
      if (bytes > MAX_BYTES) throw new Error(`${shot.file} is ${bytes} bytes, over the 256 KiB cap`);
    }
    console.log('All 4 screenshots rendered.');
  } finally {
    server.kill();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
