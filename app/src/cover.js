// Vice Light Cover Studio — the cover engine.
// Draws multi-panel GTA-style poster art on a 2D canvas: per-panel photo crop,
// posterization + 4-stop Vice gradient maps, Sobel ink outlines, grain, vignette,
// halftone title block, gradient display lettering with a neon script subtitle.
// Everything is drawn from the state object; no network, no fonts beyond the
// two OFL faces bundled under app/fonts/.

/** Longest side an input photo may keep: a 12 MP phone photo is downscaled
 * to this at load time (see main.js loadImage) so export cannot stall. */
export const MAX_IMAGE_DIMENSION = 2048;

export const GRADES = {
  sunset: { name: 'Vice Sunset', stops: [[0, [22, 10, 48]], [0.38, [198, 43, 126]], [0.72, [255, 126, 74]], [1, [255, 215, 106]]] },
  neon: { name: 'Neon Night', stops: [[0, [8, 6, 28]], [0.36, [74, 28, 110]], [0.68, [255, 46, 136]], [1, [55, 230, 255]]] },
  pinkcyan: { name: 'Hot Pink / Cyan', stops: [[0, [16, 8, 40]], [0.35, [214, 36, 140]], [0.66, [255, 94, 158]], [1, [64, 224, 255]]] },
  golden: { name: 'Golden Hour', stops: [[0, [28, 14, 8]], [0.36, [150, 62, 20]], [0.68, [255, 150, 60]], [1, [255, 238, 180]]] },
  mono: { name: 'Mono Ink', stops: [[0, [10, 8, 14]], [0.4, [70, 66, 84]], [0.75, [168, 164, 180]], [1, [248, 246, 240]]] },
};

export const LAYOUTS = {
  grid4: { name: '4-Panel Grid', panels: 4 },
  hero3: { name: 'Hero + Three', panels: 4 },
  grid9: { name: '9-Panel Grid', panels: 9 },
  fullbleed: { name: 'Full Bleed', panels: 1 },
  tilted: { name: 'Tilted Snapshots', panels: 3 },
  story: { name: 'Story Stack', panels: 3 },
};

export const SIZES = {
  square: { name: 'Square 1080×1080', w: 1080, h: 1080 },
  portrait: { name: 'Portrait 1080×1350', w: 1080, h: 1350 },
  wide: { name: 'Wide 1920×1080', w: 1920, h: 1080 },
};

/** Seeded PRNG so grain is identical on every render of the same cover. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Panel rectangles (and rotation) for a layout, in canvas pixels. */
export function panelRects(layout, W, H) {
  const gap = Math.round(Math.min(W, H) * 0.016);
  const titleH = Math.round(H * (layout === 'grid9' ? 0.16 : 0.19));
  const artH = H - titleH;
  const r = (x, y, w, h, rot = 0) => ({ x, y, w, h, rot });
  switch (layout) {
    case 'grid4': {
      const cw = (W - gap * 3) / 2, ch = (artH - gap * 3) / 2;
      return [r(gap, gap, cw, ch), r(gap * 2 + cw, gap, cw, ch), r(gap, gap * 2 + ch, cw, ch), r(gap * 2 + cw, gap * 2 + ch, cw, ch)];
    }
    case 'hero3': {
      const heroH = artH * 0.58, cw = (W - gap * 4) / 3, ch = artH - heroH - gap * 2;
      return [r(gap, gap, W - gap * 2, heroH),
        r(gap, heroH + gap * 2, cw, ch), r(gap * 2 + cw, heroH + gap * 2, cw, ch), r(gap * 3 + cw * 2, heroH + gap * 2, cw, ch)];
    }
    case 'grid9': {
      const cw = (W - gap * 4) / 3, ch = (artH - gap * 4) / 3, out = [];
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++)
        out.push(r(gap + col * (cw + gap), gap + row * (ch + gap), cw, ch));
      return out;
    }
    case 'fullbleed':
      return [r(0, 0, W, H)];
    case 'tilted': {
      const pw = W * 0.52, ph = H * 0.46;
      return [r(W * 0.06, H * 0.05, pw, ph, -0.06), r(W * 0.42, H * 0.28, pw, ph, 0.05), r(W * 0.10, H * 0.52, pw, ph, -0.03)];
    }
    case 'story': {
      const ch = (artH - gap * 4) / 3, out = [];
      for (let i = 0; i < 3; i++) out.push(r(gap, gap + i * (ch + gap), W - gap * 2, ch));
      return out;
    }
    default: return [r(gap, gap, W - gap * 2, artH - gap)];
  }
}

/** Where the title block sits for a layout. */
export function titleZone(layout, W, H) {
  if (layout === 'fullbleed') return { x: 0, y: H * 0.68, w: W, h: H * 0.32 };
  if (layout === 'tilted') return { x: 0, y: 0, w: W, h: H * 0.10 };
  const titleH = Math.round(H * (layout === 'grid9' ? 0.16 : 0.19));
  return { x: 0, y: H - titleH, w: W, h: titleH };
}

function gradeColor(stops, t) {
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i], [p1, c1] = stops[i + 1];
    if (t <= p1) {
      const f = p1 === p0 ? 0 : (t - p0) / (p1 - p0);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return stops[stops.length - 1][1];
}

/** Draws an image cover-fitting a rect, with zoom (1 = fit) and pan offsets in px. */
export function drawPhotoCover(ctx, img, rect, zoom, ox, oy) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const base = Math.max(rect.w / iw, rect.h / ih) * (zoom || 1);
  const dw = iw * base, dh = ih * base;
  ctx.drawImage(img, rect.x + (rect.w - dw) / 2 + (ox || 0), rect.y + (rect.h - dh) / 2 + (oy || 0), dw, dh);
}

/** A panel whose luminance takes fewer distinct values than this is flat
 * artwork (an SVG sample scene, a vector poster), not a photograph: the
 * contrast stretch is skipped for it. Measured at story-panel size
 * (514×521 px), counting unquantized float luminance exactly as gradePanel
 * computes it: rooftop 2,576 / pier 2,909 / beach 3,388 / neon 2,321
 * distinct values, against 75,947 for a real photo — the threshold sits
 * ~2.4× above the busiest flat art and ~9× below the photo. Counting
 * integer (0–255) levels does NOT separate the two (photo 234 vs art
 * 211–221), so the count must be over float luminance. A gradient sky
 * alone spans ~200 integer levels, which is also why the old <48-level
 * span guard could not catch this: the rooftop panel's 2nd–98th span is
 * 199 levels and the stretch crushed its dark buildings to pure black. */
export const FLAT_ART_MAX_DISTINCT_LUMINANCE = 8192;

/** Contrast stretch for one panel's luminance, in place. Finds the 2nd and
 * 98th percentile of the panel's own tones and maps that range onto 8–247
 * through a smoothstep, so a low-contrast photo gains mid-tone separation
 * before posterization without clipping its highlights or shadows. Flat
 * artwork is left untouched: its few distinct tones are deliberate, and
 * stretching them crushes dark silhouettes to pure black (the rooftop and
 * pier sample scenes). A panel whose tones already span a narrow band is
 * left untouched as well. */
export function stretchLuminance(lum, n) {
  const hist = new Uint32Array(256);
  const distinct = new Set();
  for (let i = 0; i < n; i++) {
    const v = lum[i];
    distinct.add(v);
    hist[Math.max(0, Math.min(255, v | 0))]++;
  }
  if (distinct.size < FLAT_ART_MAX_DISTINCT_LUMINANCE) return; // flat art: do not stretch
  const loTarget = n * 0.02, hiTarget = n * 0.98;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc < loTarget) lo = v + 1;
    if (acc < hiTarget) hi = v;
  }
  if (hi - lo < 48) return; // already flat: stretching would only add noise
  const span = hi - lo;
  for (let i = 0; i < n; i++) {
    let t = (lum[i] - lo) / span;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    lum[i] = 8 + t * t * (3 - 2 * t) * 239;
  }
}

/** Posterize + gradient-map + Sobel ink + grain over one panel rect, in place. */
export function gradePanel(ctx, rect, grade, inkStrength, grainAmount, seed) {
  const x = Math.max(0, Math.round(rect.x)), y = Math.max(0, Math.round(rect.y));
  const w = Math.min(Math.round(rect.w), ctx.canvas.width - x);
  const h = Math.min(Math.round(rect.h), ctx.canvas.height - y);
  if (w < 4 || h < 4) return;
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data, n = w * h;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    lum[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
  }
  // Real-photo shading: stretch the panel's own luminance range before
  // posterization. A low-contrast photo bunches its tones into a narrow
  // band, and the 5-level posterizer then collapses it into a muddy
  // silhouette; spreading the 2nd–98th percentile range across 8–247
  // (smoothstepped, so highlights/shadows roll off instead of clipping)
  // restores the mid-tone separation cel shading needs. Flat artwork is
  // detected by its distinct-luminance count and left alone: a gradient
  // sky spans ~200 integer levels, so a span guard cannot tell it from a
  // photo, but its ~2–3k distinct float tones against a photo's ~76k can
  // (see FLAT_ART_MAX_DISTINCT_LUMINANCE) — stretching flat art crushed
  // the rooftop and pier sample scenes to near-black.
  stretchLuminance(lum, n);
  const levels = 5;
  const ink = inkStrength / 100, grain = grainAmount / 100;
  const rnd = mulberry32(seed);
  const stops = GRADES[grade] ? GRADES[grade].stops : GRADES.sunset.stops;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = py * w + px, p = i * 4;
      // Sobel edge magnitude on luminance.
      let gx = 0, gy = 0;
      if (px > 0 && px < w - 1 && py > 0 && py < h - 1) {
        gx = -lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1] + lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1];
        gy = -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1] + lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1];
      }
      const edge = Math.min(1, Math.sqrt(gx * gx + gy * gy) / 380);
      const q = Math.round((lum[i] / 255) * (levels - 1)) / (levels - 1);
      const c = gradeColor(stops, q);
      const inkMix = edge * ink * 0.9;
      const nz = grain ? (rnd() - 0.5) * 255 * grain * 0.16 : 0;
      d[p] = Math.max(0, Math.min(255, c[0] * (1 - inkMix) + 12 * inkMix + nz));
      d[p + 1] = Math.max(0, Math.min(255, c[1] * (1 - inkMix) + 8 * inkMix + nz));
      d[p + 2] = Math.max(0, Math.min(255, c[2] * (1 - inkMix) + 26 * inkMix + nz));
    }
  }
  ctx.putImageData(img, x, y);
}

function drawVignette(ctx, rect) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const r = Math.max(rect.w, rect.h) * 0.72;
  const g = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
  g.addColorStop(0, 'rgba(10,6,24,0)');
  g.addColorStop(1, 'rgba(10,6,24,0.38)');
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

function drawHalftone(ctx, zone) {
  const step = Math.max(10, zone.h * 0.16);
  ctx.save();
  ctx.fillStyle = 'rgba(255,215,106,0.16)';
  for (let y = zone.y + step / 2; y < zone.y + zone.h; y += step) {
    for (let x = zone.x + step / 2; x < zone.x + zone.w; x += step) {
      const rr = step * 0.16 * (1 + ((x + y) % 3) * 0.2);
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

/** Draws the title + neon script subtitle inside the title zone. */
export function drawTitleBlock(ctx, zone, state, W) {
  const { title, subtitle, titleScale, grade } = state;
  const stops = (GRADES[grade] || GRADES.sunset).stops;
  drawHalftone(ctx, zone);
  const text = (title || 'VICE LIGHT').trim().toUpperCase();
  let size = zone.h * 0.52 * ((titleScale || 100) / 100);
  ctx.font = `${size}px Anton, 'Arial Black', sans-serif`;
  const maxW = zone.w * 0.92;
  while (ctx.measureText(text).width > maxW && size > 18) {
    size -= 3;
    ctx.font = `${size}px Anton, 'Arial Black', sans-serif`;
  }
  const cy = zone.y + zone.h * 0.52;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // Gradient fill: gold -> hot pink -> cyan across the word.
  const grad = ctx.createLinearGradient(zone.x + (zone.w - ctx.measureText(text).width) / 2, 0,
    zone.x + (zone.w + ctx.measureText(text).width) / 2, 0);
  grad.addColorStop(0, '#ffd76a');
  grad.addColorStop(0.45, '#ff5e9e');
  grad.addColorStop(1, '#37e6ff');
  ctx.lineWidth = Math.max(6, size * 0.16);
  ctx.strokeStyle = '#12082e';
  ctx.strokeText(text, zone.w / 2, cy);
  ctx.fillStyle = grad;
  ctx.fillText(text, zone.w / 2, cy);
  // Neon script subtitle, overlapping the title's foot.
  const sub = (subtitle || '').trim();
  if (sub) {
    const subSize = Math.max(16, zone.h * 0.24);
    ctx.font = `${subSize}px Pacifico, cursive`;
    const sy = zone.y + zone.h * 0.86;
    ctx.save();
    ctx.shadowColor = '#ff2e88';
    ctx.shadowBlur = subSize * 0.55;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(sub, zone.w / 2, sy);
    ctx.shadowColor = '#37e6ff';
    ctx.shadowBlur = subSize * 0.25;
    ctx.fillText(sub, zone.w / 2, sy);
    ctx.restore();
  }
  void stops; void W;
}

/** Renders the whole cover onto `canvas` at its own pixel size. */
export function drawCover(canvas, state, photos) {
  // willReadFrequently: gradePanel reads every panel back with getImageData.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const W = canvas.width, H = canvas.height;
  const { layout } = state;
  // Backdrop: deep violet with a sunset wash so gaps read as poster, not blank.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#2b1055'); bg.addColorStop(0.55, '#7a1e63'); bg.addColorStop(1, '#ff7e4a');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const rects = panelRects(layout, W, H);
  const zone = titleZone(layout, W, H);
  rects.forEach((rect, i) => {
    const panel = (state.panels && state.panels[i]) || { photo: 0, zoom: 1, ox: 0, oy: 0 };
    const img = photos[panel.photo] || photos[0] || null;
    ctx.save();
    if (rect.rot) {
      ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
      ctx.rotate(rect.rot);
      ctx.translate(-rect.w / 2, -rect.h / 2);
    } else {
      ctx.translate(rect.x, rect.y);
    }
    // White poster frame, then the photo inside it (clipped: a cover-fit photo
    // is taller than a wide panel and must not spill into its neighbours).
    ctx.fillStyle = '#fff8ef';
    ctx.fillRect(-7, -7, rect.w + 14, rect.h + 14);
    ctx.fillStyle = '#1c1030';
    ctx.fillRect(0, 0, rect.w, rect.h);
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, rect.w, rect.h);
      ctx.clip();
      drawPhotoCover(ctx, img, { x: 0, y: 0, w: rect.w, h: rect.h }, panel.zoom, panel.ox, panel.oy);
      ctx.restore();
    }
    ctx.restore();
    // Grade + ink + grain + vignette in canvas coordinates (rotation-safe: axis-aligned box).
    const box = rect.rot
      ? { x: rect.x - Math.abs(rect.h * Math.sin(rect.rot)) / 2, y: rect.y - Math.abs(rect.w * Math.sin(rect.rot)) / 2, w: rect.w + Math.abs(rect.h * Math.sin(rect.rot)), h: rect.h + Math.abs(rect.w * Math.sin(rect.rot)) }
      : rect;
    if (img) gradePanel(ctx, box, state.grade, state.ink, state.grain, 1234 + i * 77);
    drawVignette(ctx, box);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,248,239,0.9)';
    ctx.lineWidth = Math.max(2, Math.min(W, H) * 0.004);
    if (rect.rot) {
      ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
      ctx.rotate(rect.rot);
      ctx.strokeRect(-rect.w / 2, -rect.h / 2, rect.w, rect.h);
    } else {
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }
    ctx.restore();
  });
  // Title block band (full-bleed: dark scrim behind the lettering first).
  if (layout === 'fullbleed') {
    const scrim = ctx.createLinearGradient(0, zone.y - zone.h * 0.3, 0, H);
    scrim.addColorStop(0, 'rgba(18,8,46,0)');
    scrim.addColorStop(1, 'rgba(18,8,46,0.82)');
    ctx.fillStyle = scrim; ctx.fillRect(0, zone.y - zone.h * 0.3, W, H - zone.y + zone.h * 0.3);
  } else if (layout === 'tilted') {
    ctx.fillStyle = 'rgba(18,8,46,0.55)';
    ctx.fillRect(0, 0, W, zone.h);
  } else {
    ctx.fillStyle = '#12082e';
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
    ctx.fillStyle = '#ffd76a';
    ctx.fillRect(zone.x, zone.y, zone.w, Math.max(3, zone.h * 0.04));
  }
  drawTitleBlock(ctx, zone, state, W);
  // Corner badge: small star stamp, top-right of the art area.
  const bx = W - Math.min(W, H) * 0.085, by = Math.min(W, H) * 0.055, br = Math.min(W, H) * 0.052;
  ctx.save();
  ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd76a'; ctx.fill();
  ctx.lineWidth = Math.max(2, br * 0.12); ctx.strokeStyle = '#12082e'; ctx.stroke();
  ctx.fillStyle = '#12082e';
  ctx.font = `${br * 0.95}px Anton, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('★', bx, by + br * 0.05);
  ctx.restore();
}

/** Default state for a fresh cover. */
export function defaultState() {
  return {
    layout: 'grid4', grade: 'sunset', size: 'square',
    title: 'VICE LIGHT', subtitle: 'sunset over the boulevard',
    titleScale: 100, ink: 70, grain: 35,
    panels: Array.from({ length: 9 }, (_, i) => ({ photo: i % 4, zoom: 1, ox: 0, oy: 0 })),
    selected: 0,
  };
}
