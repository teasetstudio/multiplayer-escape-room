/** Small deterministic generator (mulberry32) so a session seed reproduces every random choice. */
export type Rng = () => number;
export function createRng(seed: string): Rng {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (rng: Rng, limit: number) => Math.floor(rng() * limit);
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = pick(rng, i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
export function opaqueId(rng: Rng, prefix = '') {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  return prefix + Array.from({ length: 10 }, () => alphabet[pick(rng, alphabet.length)]).join('');
}
