import data from './stone-hall.json' with { type: 'json' };
import { loadTiledMap } from '../world/tiled.js';

// Both applications compile this exact file. Geometry is never sent on room patches.
export const DEFAULT_MAP = loadTiledMap(data);
