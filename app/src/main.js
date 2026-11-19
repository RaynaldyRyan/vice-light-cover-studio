// Vice Light Cover Studio — the editor.
// Wires the sidebar controls and the live preview canvas to the cover
// renderer (cover.js): photos in, GTA-style multi-panel cover art out.
// Photos come from the person's own machine (file input) or from the four
// built-in SVG sample scenes; nothing is uploaded anywhere. Shot mode:
// ?shot=<id>&scene=...&layout=...&grade=...&title=...&subtitle=... renders
// one dossier screenshot scenario (see shots.js) instead of the editor.
import {
  GRADES,
  GRADE_IDS,
  LAYOUTS,
  LAYOUT_IDS,
  clampImage,
  drawCover,
  panelRects,
} from './cover.js';
import { SHOTS, shotFromQuery } from './shots.js';

const $ = (id) => document.getElementById(id);

const SCENES = [
  { id: 'beach', label: 'Beach Sunset', src: './assets/beach.svg' },
  { id: 'rooftop', label: 'Rooftop Dusk', src: './assets/rooftop.svg' },
  { id: 'neon', label: 'Neon Street', src: './assets/neon.svg' },
  { id: 'pier', label: 'Sunset Pier', src: './assets/pier.svg' },
];

const SIZES = [
  { id: 'square', label: '1080 × 1080', w: 1080, h: 1080 },
  { id: 'portrait', label: '1080 × 1350', w: 1080, h: 1350 },
  { id: 'wide', label: '1920 × 1080', w: 1920, h: 1080 },
];

const preview = $('preview');

// ------------------------------------------------------------------ state
const state = {
  layout: 'grid4',
  grade: 'sunset',
  ink: 70,
  grain: 35,
  title: 'VICE LIGHT',
  subtitle: 'sunset over the boulevard',
  titleSize: 100,
  photos: [],
  panels: [],
};
let selected = 0;
let exportSize = SIZES[0];

// Undo/redo: snapshots of the settings + panel assignments only. The photo
// list is append-only, so a panel's photo index stays valid across undo.
const past = [];
const future = [];
function snapshot() {
  return JSON.stringify({
    layout: state.layout,
    grade: state.grade,
    ink: state.ink,
    grain: state.grain,
    title: state.title,
    subtitle: state.subtitle,
    titleSize: state.titleSize,
    panels: state.panels,
    selected,
  });
}
function restore(json) {
  const s = JSON.parse(json);
  Object.assign(state, {
    layout: s.layout,
    grade: s.grade,
    ink: s.ink,
    grain: s.grain,
    title: s.title,
    subtitle: s.subtitle,
    titleSize: s.titleSize,
    panels: s.panels,
  });
  selected = s.selected;
  syncControls();
  render();
}
function pushHistory() {
  past.push(snapshot());
  if (past.length > 50) past.shift();
  future.length = 0;
  syncUndoRedo();
}
function undo() {
  if (!past.length) return;
  future.push(snapshot());
  restore(past.pop());
  syncUndoRedo();
}
function redo() {
  if (!future.length) return;
  past.push(snapshot());
  restore(future.pop());
  syncUndoRedo();
}
function syncUndoRedo() {
  $('undo').disabled = past.length === 0;
  $('redo').disabled = future.length === 0;
}

// ------------------------------------------------------------------ images
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

async function addPhoto(img, key, uploaded) {
  const small = clampImage(img);
  if (small !== img) await loadImage(small.src);
  small.dataset.key = key;
  small.dataset.uploaded = uploaded ? '1' : '';
  state.photos.push(small);
  buildThumbs();
  return state.photos.length - 1;
}

async function loadScenes() {
  for (const scene of SCENES) {
    const img = await loadImage(scene.src);
    img.dataset.key = `scene:${scene.id}`;
    img.dataset.uploaded = '';
    state.photos.push(img);
  }
}

function resetPanels(layout) {
  const count = panelRects(1080, 1080, layout).rects.length;
  const old = state.panels;
  state.panels = Array.from({ length: count }, (_, i) => {
    const prev = old[i];
    return {
      src: prev ? prev.src : i % Math.max(1, state.photos.length),
      x: 0,
      y: 0,
      z: 1,
    };
  });
  selected = Math.min(selected, count - 1);
}

// ------------------------------------------------------------------ render
function render() {
  drawCover(preview, state);
  syncSelectedInfo();
}

function syncSelectedInfo() {
  const n = state.panels.length;
  const panel = state.panels[selected];
  const photo = panel ? state.photos[panel.src] : null;
  $('selectedInfo').textContent = panel
    ? `Panel ${selected + 1} of ${n} — ${photo ? photoLabel(photo) : 'empty'}`
    : 'No panel selected';
  $('zoom').value = Math.round((panel?.z ?? 1) * 100);
  $('zoomVal').textContent = `${Math.round((panel?.z ?? 1) * 100)}%`;
}

function photoLabel(img) {
  const key = img.dataset.key ?? '';
  if (key.startsWith('scene:')) {
    const scene = SCENES.find((s) => s.id === key.slice(6));
    return scene ? scene.label : key;
  }
  return img.dataset.uploaded ? 'Your photo' : 'Photo';
}

// ---------------------------------------------------------------- controls
function buildChoices(container, items, current, onPick) {
  const box = $(container);
  box.innerHTML = '';
  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.label;
    if (item.id === current) btn.classList.add('active');
    btn.addEventListener('click', () => {
      onPick(item.id);
      buildChoices(container, items, item.id, onPick);
    });
    box.appendChild(btn);
  }
}

function buildThumbs() {
  const box = $('thumbs');
  box.innerHTML = '';
  state.photos.forEach((img, i) => {
    const thumb = document.createElement('img');
    thumb.src = img.src;
    thumb.alt = photoLabel(img);
    thumb.title = photoLabel(img);
    if (img.dataset.uploaded) thumb.classList.add('up');
    const panel = state.panels[selected];
    if (panel && panel.src === i) thumb.classList.add('sel');
    thumb.addEventListener('click', () => {
      pushHistory();
      state.panels[selected].src = i;
      buildThumbs();
      render();
    });
    box.appendChild(thumb);
  });
}

function syncControls() {
  $('ink').value = state.ink;
  $('inkVal').textContent = `${state.ink}%`;
  $('grain').value = state.grain;
  $('grainVal').textContent = `${state.grain}%`;
  $('title').value = state.title;
  $('subtitle').value = state.subtitle;
  $('titleSize').value = state.titleSize;
  $('titleSizeVal').textContent = `${state.titleSize}%`;
  buildChoices(
    'layouts',
    LAYOUT_IDS.map((id) => ({ id, label: LAYOUTS[id].label })),
    state.layout,
    (id) => {
      pushHistory();
      state.layout = id;
      resetPanels(id);
      render();
    },
  );
  buildChoices(
    'grades',
    GRADE_IDS.map((id) => ({ id, label: GRADES[id].label })),
    state.grade,
    (id) => {
      pushHistory();
      state.grade = id;
      render();
    },
  );
  buildChoices(
    'sizes',
    SIZES.map((s) => ({ id: s.id, label: s.label })),
    exportSize.id,
    (id) => {
      exportSize = SIZES.find((s) => s.id === id);
    },
  );
  buildThumbs();
  syncUndoRedo();
}

function bindControls() {
  $('upload').addEventListener('change', async (event) => {
    const files = [...event.target.files];
    for (const file of files) {
      try {
        const url = URL.createObjectURL(file);
        const img = await loadImage(url);
        const index = await addPhoto(img, `upload:${file.name}`, true);
        pushHistory();
        state.panels[selected].src = index;
        buildThumbs();
        render();
        setStatus(`Added ${file.name}.`);
      } catch {
        setStatus(`Could not read ${file.name}.`);
      }
    }
    event.target.value = '';
  });

  const slider = (id, key, format) => {
    $(id).addEventListener('input', (event) => {
      state[key] = Number(event.target.value);
      $(`${id}Val`).textContent = format(state[key]);
      render();
    });
    $(id).addEventListener('change', pushHistory);
  };
  slider('ink', 'ink', (v) => `${v}%`);
  slider('grain', 'grain', (v) => `${v}%`);
  slider('titleSize', 'titleSize', (v) => `${v}%`);
  $('zoom').addEventListener('input', (event) => {
    const panel = state.panels[selected];
    if (panel) {
      panel.z = Number(event.target.value) / 100;
      $('zoomVal').textContent = `${event.target.value}%`;
      render();
    }
  });
  $('zoom').addEventListener('change', pushHistory);

  $('title').addEventListener('input', (event) => {
    state.title = event.target.value;
    render();
  });
  $('title').addEventListener('change', pushHistory);
  $('subtitle').addEventListener('input', (event) => {
    state.subtitle = event.target.value;
    render();
  });
  $('subtitle').addEventListener('change', pushHistory);

  $('fillAll').addEventListener('click', () => {
    pushHistory();
    const src = state.panels[selected]?.src ?? 0;
    for (const panel of state.panels) panel.src = src;
    render();
    setStatus('All panels now use the same photo.');
  });

  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  $('export').addEventListener('click', exportPng);
}

function setStatus(text) {
  $('status').textContent = text;
}

// ------------------------------------------------------------ canvas input
function panelAt(point) {
  const rect = preview.getBoundingClientRect();
  const x = ((point.clientX - rect.left) / rect.width) * preview.width;
  const y = ((point.clientY - rect.top) / rect.height) * preview.height;
  const { rects } = panelRects(preview.width, preview.height, state.layout);
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

function bindCanvas() {
  let drag = null;
  preview.addEventListener('pointerdown', (event) => {
    const i = panelAt(event);
    if (i < 0) return;
    selected = i;
    buildThumbs();
    syncSelectedInfo();
    const rect = preview.getBoundingClientRect();
    drag = {
      panel: i,
      lastX: event.clientX,
      lastY: event.clientY,
      scaleX: preview.width / rect.width,
      scaleY: preview.height / rect.height,
      moved: false,
    };
    preview.setPointerCapture(event.pointerId);
  });
  preview.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const { rects } = panelRects(preview.width, preview.height, state.layout);
    const r = rects[drag.panel];
    const dx = (event.clientX - drag.lastX) * drag.scaleX;
    const dy = (event.clientY - drag.lastY) * drag.scaleY;
    if (Math.abs(dx) + Math.abs(dy) > 0) drag.moved = true;
    const panel = state.panels[drag.panel];
    panel.x = Math.min(0.5, Math.max(-0.5, panel.x + dx / r.w));
    panel.y = Math.min(0.5, Math.max(-0.5, panel.y + dy / r.h));
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    render();
  });
  preview.addEventListener('pointerup', () => {
    if (drag?.moved) pushHistory();
    drag = null;
  });
}

// ------------------------------------------------------------------ export
function exportPng() {
  const { w, h } = exportSize;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  drawCover(out, state);
  out.toBlob((blob) => {
    if (!blob) {
      setStatus('Export failed — the browser could not make the PNG.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vice-light-cover-${w}x${h}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setStatus(`Exported ${w} × ${h} PNG.`);
  }, 'image/png');
}

// ---------------------------------------------------------------- shot mode
async function applyShot(shot) {
  const img = await loadImage(`./assets/${shot.scene}.svg`);
  img.dataset.key = `scene:${shot.scene}`;
  img.dataset.uploaded = '';
  state.photos = [img];
  state.layout = LAYOUTS[shot.layout] ? shot.layout : 'grid4';
  state.grade = GRADES[shot.grade] ? shot.grade : 'sunset';
  state.title = shot.title;
  state.subtitle = shot.subtitle;
  resetPanels(state.layout);
  for (const panel of state.panels) panel.src = 0;
  if (shot.mode === 'wide') {
    preview.width = 1920;
    preview.height = 1080;
  }
  if (shot.mode !== 'editor') document.body.classList.add('shot-cover');
  syncControls();
  await document.fonts.ready;
  render();
  window.__shotDone = true;
}

// --------------------------------------------------------------------- boot
async function boot() {
  bindControls();
  bindCanvas();
  const shot = shotFromQuery(window.location.search);
  if (shot) {
    await applyShot(shot);
    return;
  }
  await loadScenes();
  resetPanels(state.layout);
  syncControls();
  render();
  document.fonts.ready.then(render);
}

boot().catch((error) => {
  setStatus(`Could not start the studio: ${error.message}`);
  console.error(error);
});

export { SHOTS };
