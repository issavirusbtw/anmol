// Single place for naming and global tuning so a rename is trivial.
export const GAME_NAME = 'Shelf Life';
export const GAME_TITLE = GAME_NAME.toUpperCase();
export const GAME_SUBTITLE = 'Chapter 1 — A Place on the Shelf';
export const SAVE_KEY = 'shelflife.save';
export const SETTINGS_KEY = 'shelflife.settings';
export const SAVE_VERSION = 1;

/** World scale: 1 unit ≈ 1.43 real cm, so a 2.5 cm person is 1.75 units tall. */
export const PERSON_HEIGHT = 1.75;

/** Fixed simulation step. */
export const SIM_DT = 1 / 60;

/** Shelf top heights for the six tiers (y of walkable surface). */
export const TIER_Y = [0, 20, 42, 64, 86, 108] as const;
export const CABINET = {
  minX: -66,
  maxX: 66,
  minZ: -14,
  maxZ: 14,
  top: 130,
  glassZ: 14.8,
  shelfThickness: 1.3,
  /** Shelves stop short of the glass, leaving a narrow gap you can look down through. */
  shelfFrontZ: 12.6,
  dividerX: 22,
};

export interface Params {
  auto: boolean;
  seed: number;
  state: 'intro' | 'lower' | 'market' | 'upper' | 'sump';
  event: 'candy' | 'fall' | null;
  kit: boolean;
  view: 'wide' | 'market' | null;
  t: number | null;
  quality: 'high' | 'low' | null;
  fresh: boolean;
  test: boolean;
}

export function readParams(): Params {
  const q = new URLSearchParams(location.search);
  const state = q.get('state');
  const view = q.get('view');
  const tRaw = q.get('t');
  const quality = q.get('quality');
  return {
    auto: q.get('auto') === '1',
    seed: q.has('seed') ? (parseInt(q.get('seed')!, 10) >>> 0) : 1337,
    state: state === 'lower' || state === 'market' || state === 'upper' || state === 'sump' ? state : 'intro',
    event: q.get('event') === 'candy' ? 'candy' : q.get('event') === 'fall' ? 'fall' : null,
    kit: q.get('kit') === '1',
    view: view === 'wide' || view === 'market' ? view : null,
    t: tRaw !== null && !isNaN(parseFloat(tRaw)) ? Math.max(0, parseFloat(tRaw)) : null,
    quality: quality === 'low' || quality === 'high' ? quality : null,
    fresh: q.get('fresh') === '1',
    test: q.get('test') === '1',
  };
}
