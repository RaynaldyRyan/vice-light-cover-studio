// Screenshot scenarios for Vice Light Cover Studio.
// Each scenario is one dossier screenshot: which scene, layout and grade it
// shows, the caption on the cover, and the pixel size of the shot. The app
// (main.js) applies a scenario when the page is opened with ?shot=<id>, and
// the maker's runner renders each one headlessly. Pure data + pure parsing:
// no DOM here, so the runner can import this file in Node as well.

export const SHOTS = [
  {
    id: 'cover',
    file: '01-cover.jpg',
    mode: 'cover',
    w: 1080,
    h: 1080,
    scene: 'pier',
    layout: 'grid4',
    grade: 'sunset',
    title: 'SUNSET HEIST',
    subtitle: 'one last score on the pier',
  },
  {
    id: 'editor',
    file: '02-editor.jpg',
    mode: 'editor',
    w: 1280,
    h: 720,
    scene: 'beach',
    layout: 'heroThree',
    grade: 'neon',
    title: 'BOULEVARD QUEEN',
    subtitle: 'queen of the boulevard',
  },
  {
    id: 'story',
    file: '03-story.jpg',
    mode: 'cover',
    w: 1080,
    h: 1080,
    scene: 'neon',
    layout: 'heroThree',
    grade: 'pinkcyan',
    title: 'NEON NIGHTS',
    subtitle: 'the city never sleeps',
  },
  {
    id: 'wide',
    file: '04-wide.jpg',
    mode: 'wide',
    w: 1280,
    h: 720,
    scene: 'rooftop',
    layout: 'storyStack',
    grade: 'golden',
    title: 'ROOFTOP DAWN',
    subtitle: 'above it all',
  },
];

/** The URL query a scenario needs (?shot=<id>&scene=...&layout=...&grade=...). */
export function shotQuery(shot) {
  const q = new URLSearchParams({
    shot: shot.id,
    scene: shot.scene,
    layout: shot.layout,
    grade: shot.grade,
    title: shot.title,
    subtitle: shot.subtitle,
  });
  return `?${q.toString()}`;
}

/**
 * Parses a page query (?shot=cover&scene=pier&layout=grid4&grade=sunset
 * &title=...&subtitle=...) into the scenario the page should render, or
 * null for a normal interactive visit. Unknown ids fall back to the first
 * scenario's shape with the caller's own values, so a hand-typed query
 * still renders something sensible.
 */
export function shotFromQuery(search) {
  const params = new URLSearchParams(search);
  const id = params.get('shot');
  if (!id) return null;
  const base = SHOTS.find((s) => s.id === id) ?? SHOTS[0];
  const pick = (key, fallback) => {
    const v = params.get(key);
    return v === null || v === '' ? fallback : v;
  };
  return {
    ...base,
    id,
    scene: pick('scene', base.scene),
    layout: pick('layout', base.layout),
    grade: pick('grade', base.grade),
    title: pick('title', base.title),
    subtitle: pick('subtitle', base.subtitle),
  };
}
