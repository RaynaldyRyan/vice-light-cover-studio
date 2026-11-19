// Vice Light Cover Studio — cover renderer.
// Draws GTA-style multi-panel cover art onto a canvas: each panel holds a photo
// (or a sample scene) run through a posterized gradient-map grade with inked
// edges, grain and a vignette, under a halftone title block with gradient
// display lettering, a neon script subtitle and a star badge. Everything is
// drawn with the plain 2D canvas API; no library, no network.

// ---------------------------------------------------------------- grades
// Each grade is a ramp of [position, r, g, b] stops that luminance is mapped
// through after posterization.
export const GRADES = {
  sunset: {
    label: 'Vice Sunset',
    stops: [
      [0.0, 26, 8, 46],
      [0.25, 122, 28, 110],
      [0.5, 214, 58, 122],
      [0.75, 255, 138, 76],
      [1.0, 255, 214, 130],
    ],
  },
  neon: {
    label: 'Neon Night',
    stops: [
      [0.0, 5, 5, 22],
      [0.3, 38, 20, 96],
      [0.55, 110, 40, 170],
      [0.8, 190, 60, 220],
      [1.0, 80, 230, 255],
    ],
  },
  pinkcyan: {
    label: 'Hot Pink / Cyan',
    stops: [
      [0.0, 16, 4, 28],
      [0.3, 150, 16, 120],
      [0.55, 255, 45, 150],
      [0.8, 255, 120, 190],
      [1.0, 70, 235, 245],
    ],
  },
  golden: {
    label: 'Golden Hour',
    stops: [
      [0.0, 30, 16, 6],
      [0.3, 110, 58, 18],
      [0.55, 205, 118, 34],
      [0.8, 250, 178, 80],
      [1.0, 255, 238, 190],
    ],
  },
  mono: {
    label: 'Mono Ink',
    stops: [
      [0.0, 8, 8, 12],
      [0.35, 70, 68, 80],
      [0.65, 150, 148, 158],
      [1.0, 248, 246, 240],
    ],
  },
};

export const GRADE_IDS = Object.keys(GRADES);

// ---------------------------------------------------------------- layouts
// A layout is a function of (width, height, gutter) returning panel rects.
// Every rect is { x, y, w, h, rot } with rotation in radians around its centre.
export const LAYOUTS = {
  grid4: {
    label: '4-Panel Grid',
    rects(w, h, g) {
      const cw = (w - g * 3) / 2;
      const ch = (h - g * 3) / 2;
      return [
        { x: g, y: g, w: cw, h: ch, rot: 0 },
        { x: g * 2 + cw, y: g, w: cw, h: ch, rot: 0 },
        { x: g, y: g * 2 + ch, w: cw, h: ch, rot: 0 },
        { x: g * 2 + cw, y: g * 2 + ch, w: cw, h: ch, rot: 0 },
      ];
    },
  },
  heroThree: {
    label: 'Hero + Three',
    rects(w, h, g) {
      const heroW = (w - g * 3) * 0.58;
      const sideX = g * 2 + heroW;
      const sideW = w - sideX - g;
      const ch = (h - g * 4) / 3;
      return [
        { x: g, y: g, w: heroW, h: h - g * 2, rot: 0 },
        { x: sideX, y: g, w: sideW, h: ch, rot: 0 },
        { x: sideX, y: g * 2 + ch, w: sideW, h: ch, rot: 0 },
        { x: sideX, y: g * 3 + ch * 2, w: sideW, h: ch, rot: 0 },
      ];
    },
  },
  grid9: {
    label: '9-Panel Grid',
    rects(w, h, g) {
      const cw = (w - g * 4) / 3;
      const ch = (h - g * 4) / 3;
      const out = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          out.push({ x: g + c * (cw + g), y: g + r * (ch + g), w: cw, h: ch, rot: 0 });
        }
      }
      return out;
    },
  },
  fullBleed: {
    label: 'Full Bleed',
    rects(w, h, g) {
      return [{ x: 0, y: 0, w, h, rot: 0 }];
    },
  },
  tilted: {
    label: 'Tilted Snapshots',
    rects(w, h, g) {
      const pw = (w - g * 4) * 0.52;
      const ph = (h - g * 3) * 0.62;
      return [
        { x: g, y: g, w: pw, h: ph, rot: -0.1 },
        { x: w - pw - g, y: g * 1.5, w: pw, h: ph, rot: 0.09 },
        { x: (w - pw) / 2, y: h - ph - g, w: pw, h: ph, rot: -0.03 },
      ];
    },
  },
  storyStack: {
    label: 'Story Stack',
    rects(w, h, g) {
      const topH = (h - g * 3) * 0.55;
      const botY = g * 2 + topH;
      const botH = h - botY - g;
      const botW = (w - g * 3) / 2;
      return [
        { x: g, y: g, w: w - g * 2, h: topH, rot: 0 },
        { x: g, y: botY, w: botW, h: botH, rot: 0 },
        { x: g * 2 + botW, y: botY, w: botW, h: botH, rot: 0 },
      ];
    },
  },
};

export const LAYOUT_IDS = Object.keys(LAYOUTS);

// ------------------------------------------------------------ pixel grade
function smoothstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function rampColor(stops, t) {
  if (t <= stops[0][0]) return stops[0].slice(1);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, r0, g0, b0] = stops[i - 1];
      const [t1, r1, g1, b1] = stops[i];
      const f = (t - t0) / (t1 - t0 || 1);
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
    }
  }
  return stops[stops.length - 1].slice(1);
}

/**
 * Grades one panel's pixels in place.
 * `data` is a Uint8ClampedArray (RGBA) of width*height pixels.
 * Real photographs get a contrast stretch first; flat vector art is left
 * alone so its dark panels stay readable. The stretch is decided by
 * counting distinct FLOAT luminance levels: a photo carries tens of
 * thousands, flat art only a few thousand.
 */
export function gradePixels(data, width, height, gradeId, options = {}) {
  const levels = options.posterize ?? 6;
  const inkStrength = (options.ink ?? 70) / 100;
  const grainAmount = options.grain ?? 35;
  const grade = GRADES[gradeId] ?? GRADES.sunset;
  const n = width * height;

  // Luminance as floats, plus the distinct-level count that tells photos
  // apart from flat art.
  const lum = new Float32Array(n);
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    const l = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
    lum[i] = l;
    seen.add(l);
  }
  const isPhoto = seen.size >= 8192;

  // Contrast stretch for photographs only: 2nd-98th percentile, smoothstep,
  // remapped to 8-247 so neither end crushes to pure black or white.
  let lo = 0;
  let hi = 255;
  if (isPhoto) {
    const sorted = Float32Array.from(lum).sort();
    lo = sorted[Math.floor(n * 0.02)];
    hi = sorted[Math.floor(n * 0.98)];
    if (hi - lo < 12) {
      lo = 0;
      hi = 255;
    }
  }

  // Sobel edge magnitude on luminance, for the ink outlines.
  const edge = new Float32Array(n);
  if (inkStrength > 0) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const gx =
          -lum[i - width - 1] - 2 * lum[i - 1] - lum[i + width - 1] +
          lum[i - width + 1] + 2 * lum[i + 1] + lum[i + width + 1];
        const gy =
          -lum[i - width - 1] - 2 * lum[i - width] - lum[i - width + 1] +
          lum[i + width - 1] + 2 * lum[i + width] + lum[i + width + 1];
        edge[i] = Math.min(1, Math.sqrt(gx * gx + gy * gy) / 220);
      }
    }
  }

  for (let i = 0; i < n; i++) {
    let l = lum[i];
    if (isPhoto) {
      l = 8 + 239 * smoothstep((l - lo) / (hi - lo || 1));
    }
    const q = Math.round((l / 255) * (levels - 1)) / (levels - 1);
    const [r, g, b] = rampColor(grade.stops, q);
    const e = edge[i] * inkStrength;
    const inkR = 24;
    const inkG = 12;
    const inkB = 42;
    let R = r + (inkR - r) * e;
    let G = g + (inkG - g) * e;
    let B = b + (inkB - b) * e;
    if (grainAmount > 0) {
      const nz = (Math.random() - 0.5) * grainAmount;
      R += nz;
      G += nz;
      B += nz;
    }
    data[i * 4] = R;
    data[i * 4 + 1] = G;
    data[i * 4 + 2] = B;
  }
  return { photo: isPhoto, distinctLevels: seen.size };
}

/** Clamps an uploaded image to 2048 px on its longest side (drawn copy). */
export function clampImage(img, maxSide = 2048) {
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (longest <= maxSide) return img;
  const scale = maxSide / longest;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = new Image();
  out.src = canvas.toDataURL('image/png');
  return out;
}

// ------------------------------------------------------------- cover draw
/**
 * Panel geometry for a cover of the given size: the panel rects, the title
 * block height and the gutter, all in canvas pixels. Shared by the renderer
 * and by the editor's hit-testing, so a click always lands on the panel the
 * eye sees.
 */
export function panelRects(width, height, layout) {
  const scale = width / 1080;
  const gutter = Math.max(4, Math.round(10 * scale));
  const titleH = Math.round(height * 0.17);
  return { rects: LAYOUTS[layout].rects(width, height - titleH, gutter), titleH, gutter };
}

function coverDrawRect(img, rect, pan) {
  const scale = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight) * (pan.z || 1);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = rect.x + (rect.w - dw) / 2 + (pan.x || 0) * rect.w;
  const dy = rect.y + (rect.h - dh) / 2 + (pan.y || 0) * rect.h;
  return { dx, dy, dw, dh };
}

function starPath(ctx, cx, cy, rOuter, rInner, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = (i * Math.PI) / points - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawHalftone(ctx, x, y, w, h, dot, gap, color) {
  ctx.fillStyle = color;
  for (let yy = y + gap / 2; yy < y + h; yy += gap) {
    for (let xx = x + gap / 2; xx < x + w; xx += gap) {
      const fade = 0.4 + 0.6 * (1 - (yy - y) / h);
      ctx.beginPath();
      ctx.arc(xx, yy, (dot / 2) * fade, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Draws the whole cover onto `canvas` from `state`:
 *   state = { layout, grade, ink, grain, title, subtitle, titleSize,
 *             photos: [Image...], panels: [{ src, x, y, z }...] }
 * `photos` are Image elements; `panels[src]` indexes into them.
 * The canvas keeps its own size; panels and lettering scale to it.
 */
export function drawCover(canvas, state) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const { rects, titleH, gutter } = panelRects(W, H, state.layout);
  const scale = W / 1080;

  ctx.fillStyle = '#160a24';
  ctx.fillRect(0, 0, W, H);

  const work = document.createElement('canvas');

  rects.forEach((rect, i) => {
    const panel = state.panels[i] ?? { src: 0, x: 0, y: 0, z: 1 };
    const img = state.photos[panel.src];
    if (!img || !img.naturalWidth) return;

    // Render the photo into a work canvas at panel size, then grade it.
    const pw = Math.max(2, Math.round(rect.w));
    const ph = Math.max(2, Math.round(rect.h));
    work.width = pw;
    work.height = ph;
    const wctx = work.getContext('2d');
    wctx.fillStyle = '#160a24';
    wctx.fillRect(0, 0, pw, ph);
    const d = coverDrawRect(img, { x: 0, y: 0, w: pw, h: ph }, panel);
    wctx.drawImage(img, d.dx, d.dy, d.dw, d.dh);
    const imageData = wctx.getImageData(0, 0, pw, ph);
    gradePixels(imageData.data, pw, ph, state.grade, { ink: state.ink, grain: state.grain });
    wctx.putImageData(imageData, 0, 0);

    // Paste the graded panel, with a white frame and an optional tilt.
    ctx.save();
    ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
    if (rect.rot) ctx.rotate(rect.rot);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-rect.w / 2 - 3 * scale, -rect.h / 2 - 3 * scale, rect.w + 6 * scale, rect.h + 6 * scale);
    ctx.drawImage(work, -rect.w / 2, -rect.h / 2, rect.w, rect.h);
    ctx.restore();

    // Vignette over the panel.
    const vg = ctx.createRadialGradient(
      rect.x + rect.w / 2, rect.y + rect.h / 2, Math.min(rect.w, rect.h) * 0.35,
      rect.x + rect.w / 2, rect.y + rect.h / 2, Math.max(rect.w, rect.h) * 0.72,
    );
    vg.addColorStop(0, 'rgba(10, 4, 20, 0)');
    vg.addColorStop(1, 'rgba(10, 4, 20, 0.38)');
    ctx.fillStyle = vg;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  });

  // Title block: dark band, halftone dots, gradient title, neon subtitle.
  const ty = H - titleH;
  ctx.fillStyle = '#12081f';
  ctx.fillRect(0, ty, W, titleH);
  drawHalftone(ctx, 0, ty, W, titleH, 5 * scale, 16 * scale, 'rgba(255, 190, 120, 0.16)');
  ctx.fillStyle = 'rgba(255, 190, 90, 0.9)';
  ctx.fillRect(0, ty, W, Math.max(2, 3 * scale));

  const title = (state.title || 'VICE LIGHT').trim().toUpperCase();
  const titlePx = Math.round(H * 0.085 * (state.titleSize / 100));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${titlePx}px Anton, 'Arial Narrow', sans-serif`;
  let tw = ctx.measureText(title).width;
  let size = titlePx;
  while (tw > W * 0.94 && size > 14) {
    size -= 2;
    ctx.font = `${size}px Anton, 'Arial Narrow', sans-serif`;
    tw = ctx.measureText(title).width;
  }
  const grad = ctx.createLinearGradient(W * 0.08, 0, W * 0.92, 0);
  grad.addColorStop(0, '#ffd76a');
  grad.addColorStop(0.35, '#ff8a5c');
  grad.addColorStop(0.65, '#ff5fa2');
  grad.addColorStop(1, '#6fe3ff');
  ctx.fillStyle = grad;
  ctx.strokeStyle = '#160a24';
  ctx.lineWidth = Math.max(2, size * 0.08);
  ctx.lineJoin = 'round';
  const titleY = ty + titleH * 0.42;
  ctx.strokeText(title, W / 2, titleY);
  ctx.fillText(title, W / 2, titleY);

  const sub = (state.subtitle || '').trim();
  if (sub) {
    const subPx = Math.round(size * 0.42);
    ctx.font = `${subPx}px Pacifico, cursive`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#37e0ff';
    ctx.shadowBlur = subPx * 0.55;
    ctx.fillText(sub, W / 2, ty + titleH * 0.82);
    ctx.shadowBlur = 0;
  }

  // Star badge, top-right corner.
  const br = Math.round(W * 0.045);
  const bx = W - br - gutter * 2;
  const by = br + gutter * 2;
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd76a';
  ctx.fill();
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.strokeStyle = '#160a24';
  ctx.stroke();
  starPath(ctx, bx, by, br * 0.62, br * 0.26);
  ctx.fillStyle = '#160a24';
  ctx.fill();
}
