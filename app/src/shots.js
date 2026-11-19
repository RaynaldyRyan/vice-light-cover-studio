// Fixed scenes for screenshots: ?shot=editor shows the studio with sample photos
// loaded; ?shot=cover shows only the exported cover at full size (the PNG the
// app itself drew, displayed at the gate's largest size). window.__shotReady is
// set once the fonts are ready and the cover is painted.
export async function runShot(shot, query, api) {
  const { state, applyScene } = api;
  const layout = query.get('layout');
  const grade = query.get('grade');
  const size = query.get('size');
  const title = query.get('title');
  const subtitle = query.get('subtitle');
  const patch = {};
  if (layout) patch.layout = layout;
  if (grade) patch.grade = grade;
  if (size) patch.size = size;
  if (title) patch.title = title;
  if (subtitle) patch.subtitle = subtitle;
  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    // A cover shot uses the 4-panel grid by default, the strongest poster look.
    if (!layout) patch.layout = 'grid4';
    if (!grade) patch.grade = 'sunset';
    if (!title) patch.title = 'VICE LIGHT';
    if (!subtitle) patch.subtitle = 'sunset over the boulevard';
  }
  if (shot === 'story') {
    // Portrait story cover: pink/cyan grade, satirical GTA-energy title.
    document.body.classList.add('shot-cover');
    if (!layout) patch.layout = 'grid4';
    if (!grade) patch.grade = 'pinkcyan';
    if (!size) patch.size = 'portrait';
    if (!title) patch.title = 'NEON BOULEVARD';
    if (!subtitle) patch.subtitle = 'midnight on ocean drive';
  }
  if (shot === 'wide') {
    // Wide hero cover: golden-hour grade, satirical GTA-energy title.
    document.body.classList.add('shot-cover');
    if (!layout) patch.layout = 'hero3';
    if (!grade) patch.grade = 'golden';
    if (!size) patch.size = 'wide';
    if (!title) patch.title = 'SUNSET HEIST';
    if (!subtitle) patch.subtitle = 'one last score at golden hour';
  }
  applyScene(patch);
  try { await document.fonts.ready; } catch { /* fall back to system fonts */ }
  api.renderNow();
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}
