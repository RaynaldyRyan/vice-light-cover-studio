// Vice Light Cover Studio — page wiring: photos, layout/grade controls, per-panel
// crop and position, undo/redo, full-size PNG export, and ?shot= scenes for
// screenshots. Photos are read on this machine and never uploaded.
import { GRADES, LAYOUTS, SIZES, MAX_IMAGE_DIMENSION, drawCover, defaultState, panelRects } from './cover.js';
import { runShot } from './shots.js';

const SAMPLES = [
  { name: 'Beach Cruise', src: 'assets/beach.svg' },
  { name: 'Rooftop Dusk', src: 'assets/rooftop.svg' },
  { name: 'Neon Street', src: 'assets/neon.svg' },
  { name: 'Pier Sunset', src: 'assets/pier.svg' },
];

const canvas = document.getElementById('preview');
const status = document.getElementById('status');
const state = defaultState();
const photos = []; // HTMLImageElement list: samples first, then uploads
let undoStack = [], redoStack = [];
let rafPending = false;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Clamp huge photos (a 12 MP phone shot) to MAX_IMAGE_DIMENSION on the
      // long side before they enter the pipeline, so export cannot stall on
      // per-pixel grading of tens of megapixels. Downscaled through a canvas
      // and re-wrapped as an Image so callers keep .src/.naturalWidth.
      const longest = Math.max(img.naturalWidth, img.naturalHeight);
      if (longest <= MAX_IMAGE_DIMENSION) return resolve(img);
      const scale = MAX_IMAGE_DIMENSION / longest;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const small = new Image();
      small.onload = () => resolve(small);
      small.onerror = () => resolve(img); // never lose the photo over a resize
      small.src = c.toDataURL('image/png');
    };
    img.onerror = reject;
    img.src = url;
  });
}

function snapshot() { return JSON.stringify({ ...state, panels: state.panels }); }
function pushHistory() {
  undoStack.push(snapshot());
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];
  updateUndoButtons();
}
function restore(json) {
  const s = JSON.parse(json);
  Object.assign(state, s);
  syncControls();
  render();
}
function updateUndoButtons() {
  document.getElementById('undoBtn').disabled = undoStack.length === 0;
  document.getElementById('redoBtn').disabled = redoStack.length === 0;
}

function render() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    const size = SIZES[state.size];
    canvas.width = size.w; canvas.height = size.h;
    drawCover(canvas, state, photos);
  });
}

function renderNow() {
  const size = SIZES[state.size];
  canvas.width = size.w; canvas.height = size.h;
  drawCover(canvas, state, photos);
}

// ---- controls ----
function buildChoices(el, entries, current, onPick) {
  el.innerHTML = '';
  for (const [key, val] of entries) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = val.name; b.dataset.key = key;
    if (key === current) b.classList.add('active');
    b.addEventListener('click', () => { pushHistory(); onPick(key); el.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); });
    el.appendChild(b);
  }
}

function syncControls() {
  document.getElementById('titleInput').value = state.title;
  document.getElementById('subtitleInput').value = state.subtitle;
  document.getElementById('inkRange').value = state.ink;
  document.getElementById('inkVal').textContent = state.ink + '%';
  document.getElementById('grainRange').value = state.grain;
  document.getElementById('grainVal').textContent = state.grain + '%';
  document.getElementById('titleSizeRange').value = state.titleScale;
  document.getElementById('titleSizeVal').textContent = state.titleScale + '%';
  buildChoices(document.getElementById('layoutChoices'), Object.entries(LAYOUTS), state.layout, (k) => { state.layout = k; state.selected = 0; syncPanelInfo(); render(); });
  buildChoices(document.getElementById('gradeChoices'), Object.entries(GRADES), state.grade, (k) => { state.grade = k; render(); });
  buildChoices(document.getElementById('sizeChoices'), Object.entries(SIZES), state.size, (k) => { state.size = k; render(); });
  syncPanelInfo();
}

function syncPanelInfo() {
  const n = LAYOUTS[state.layout].panels;
  const i = Math.min(state.selected, n - 1);
  state.selected = i;
  const p = state.panels[i];
  document.getElementById('panelInfo').textContent =
    `Panel ${i + 1} of ${n} — photo ${p.photo + 1} (${photos[p.photo] ? (photos[p.photo].dataset.label || 'photo') : 'none'}), zoom ${Math.round(p.zoom * 100)}%.`;
  document.getElementById('zoomRange').value = Math.round(p.zoom * 100);
  document.getElementById('zoomVal').textContent = Math.round(p.zoom * 100) + '%';
  document.querySelectorAll('#thumbs img, #samples img').forEach((img) => {
    img.classList.toggle('selected', Number(img.dataset.idx) === p.photo);
  });
}

function rebuildThumbs() {
  const box = document.getElementById('thumbs');
  box.innerHTML = '';
  photos.forEach((img, idx) => {
    if (idx < SAMPLES.length) return; // uploads only; samples live below
    const t = document.createElement('img');
    t.src = img.src; t.alt = 'Uploaded photo ' + (idx - SAMPLES.length + 1);
    t.dataset.idx = idx;
    t.addEventListener('click', () => { pushHistory(); state.panels[state.selected].photo = idx; syncPanelInfo(); render(); });
    box.appendChild(t);
  });
  syncPanelInfo();
}

// ---- photo input ----
document.getElementById('photoInput').addEventListener('change', async (e) => {
  for (const file of e.target.files) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      img.dataset.label = file.name;
      photos.push(img);
    } catch { status.textContent = 'Could not read ' + file.name; }
  }
  if (photos.length) {
    pushHistory();
    state.panels[state.selected].photo = photos.length - 1;
  }
  rebuildThumbs();
  render();
});

// ---- samples ----
{
  const box = document.getElementById('samples');
  SAMPLES.forEach((s, idx) => {
    const t = document.createElement('img');
    t.src = s.src; t.alt = s.name; t.dataset.idx = idx;
    t.title = s.name;
    t.addEventListener('click', () => { pushHistory(); state.panels[state.selected].photo = idx; syncPanelInfo(); render(); });
    box.appendChild(t);
  });
}

// ---- text + sliders ----
document.getElementById('titleInput').addEventListener('input', (e) => { state.title = e.target.value; render(); });
document.getElementById('titleInput').addEventListener('change', pushHistory);
document.getElementById('subtitleInput').addEventListener('input', (e) => { state.subtitle = e.target.value; render(); });
document.getElementById('subtitleInput').addEventListener('change', pushHistory);
document.getElementById('inkRange').addEventListener('input', (e) => { state.ink = Number(e.target.value); document.getElementById('inkVal').textContent = state.ink + '%'; render(); });
document.getElementById('inkRange').addEventListener('change', pushHistory);
document.getElementById('grainRange').addEventListener('input', (e) => { state.grain = Number(e.target.value); document.getElementById('grainVal').textContent = state.grain + '%'; render(); });
document.getElementById('grainRange').addEventListener('change', pushHistory);
document.getElementById('titleSizeRange').addEventListener('input', (e) => { state.titleScale = Number(e.target.value); document.getElementById('titleSizeVal').textContent = state.titleScale + '%'; render(); });
document.getElementById('titleSizeRange').addEventListener('change', pushHistory);
document.getElementById('zoomRange').addEventListener('input', (e) => {
  const p = state.panels[state.selected];
  p.zoom = Number(e.target.value) / 100;
  document.getElementById('zoomVal').textContent = e.target.value + '%';
  render();
});
document.getElementById('zoomRange').addEventListener('change', () => { pushHistory(); syncPanelInfo(); });

// ---- panel buttons ----
document.getElementById('fillAllBtn').addEventListener('click', () => {
  pushHistory();
  const idx = state.panels[state.selected].photo;
  state.panels.forEach((p) => { p.photo = idx; });
  render();
});
document.getElementById('shuffleBtn').addEventListener('click', () => {
  pushHistory();
  const n = LAYOUTS[state.layout].panels;
  for (let i = 0; i < n; i++) state.panels[i].photo = (state.panels[i].photo + 1) % Math.max(1, photos.length);
  render();
});
document.getElementById('undoBtn').addEventListener('click', () => {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  updateUndoButtons();
});
document.getElementById('redoBtn').addEventListener('click', () => {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  updateUndoButtons();
});
// Keyboard undo/redo, so a cover can be iterated without reaching for the buttons.
document.addEventListener('keydown', (e) => {
  const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
  if (!e.ctrlKey && !e.metaKey) return;
  if (typing) return;
  if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); document.getElementById('undoBtn').click(); }
  if ((e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); document.getElementById('redoBtn').click(); }
});

// ---- canvas interaction: click to select a panel, drag to pan its photo ----
let drag = null;
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
}
function panelAt(pt) {
  const rects = panelRects(state.layout, canvas.width, canvas.height);
  for (let i = rects.length - 1; i >= 0; i--) {
    const rc = rects[i];
    if (pt.x >= rc.x && pt.x <= rc.x + rc.w && pt.y >= rc.y && pt.y <= rc.y + rc.h) return i;
  }
  return -1;
}
canvas.addEventListener('pointerdown', (e) => {
  const pt = canvasPoint(e);
  const i = panelAt(pt);
  if (i < 0) return;
  state.selected = i;
  syncPanelInfo();
  drag = { x: pt.x, y: pt.y, ox: state.panels[i].ox, oy: state.panels[i].oy, moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const pt = canvasPoint(e);
  const p = state.panels[state.selected];
  p.ox = drag.ox + (pt.x - drag.x);
  p.oy = drag.oy + (pt.y - drag.y);
  if (Math.abs(pt.x - drag.x) + Math.abs(pt.y - drag.y) > 4) drag.moved = true;
  render();
});
canvas.addEventListener('pointerup', () => {
  if (drag && drag.moved) pushHistory();
  drag = null;
});

// ---- export ----
async function exportCover(sizeKey) {
  await document.fonts.ready;
  const size = SIZES[sizeKey];
  const off = document.createElement('canvas');
  off.width = size.w; off.height = size.h;
  drawCover(off, state, photos);
  return new Promise((resolve) => {
    off.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vice-light-${size.w}x${size.h}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      resolve(blob);
    }, 'image/png');
  });
}
document.getElementById('exportBtn').addEventListener('click', async () => {
  status.textContent = 'Rendering…';
  await exportCover(state.size);
  status.textContent = `Saved vice-light-${SIZES[state.size].w}x${SIZES[state.size].h}.png`;
});
document.getElementById('exportAllBtn').addEventListener('click', async () => {
  status.textContent = 'Rendering all 3 sizes…';
  for (const key of Object.keys(SIZES)) await exportCover(key);
  status.textContent = 'Saved all 3 sizes: 1080×1080, 1080×1350, 1920×1080.';
});

// ---- boot: load samples, then apply ?shot= scenes ----
(async () => {
  for (const s of SAMPLES) {
    try {
      const img = await loadImage(s.src);
      img.dataset.label = s.name;
      photos.push(img);
    } catch { /* a missing sample must not break the app */ }
  }
  syncControls();
  updateUndoButtons();
  render();
  const shot = new URLSearchParams(location.search).get('shot');
  if (shot) {
    await runShot(shot, new URLSearchParams(location.search), {
      state, photos, renderNow, syncControls, syncPanelInfo,
      applyScene: (patch) => { Object.assign(state, patch); syncControls(); renderNow(); },
    });
  }
})();
