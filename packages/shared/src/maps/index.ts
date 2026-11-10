import twinVaults from './twin-vaults.json' with { type: 'json' };
import level2 from './level-2.json' with { type: 'json' };
import level3 from './level-3.json' with { type: 'json' };
import level4 from './level-4.json' with { type: 'json' };
import level5 from './level-5.json' with { type: 'json' };
import { loadTiledMap } from '../world/tiled.js';

// Both applications compile these exact files. Public geometry is never sent on room patches.
export const DEFAULT_MAP = loadTiledMap(twinVaults);
/** One public map per level, in play order. Hidden chambers are NOT part of these maps. */
export const LEVEL_MAPS = [
  DEFAULT_MAP,
  loadTiledMap(level2),
  loadTiledMap(level3),
  loadTiledMap(level4),
  loadTiledMap(level5),
] as const;
