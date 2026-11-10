import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VERSE_TOTAL } from '@escape/shared';

/** One verse. The number is canonical server metadata and is never sent before victory. */
export interface BibleVerse {
  verseNumber: number;
  text: string;
  reference: string;
}
export interface ScriptureDataset {
  id: string;
  language: string;
  translation: string;
  reference: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  /** Formatting changes made to the source, for the licence's "indicate changes" duty. */
  changes: string;
  /** True for the built-in non-Scripture test deck. */
  placeholder?: boolean;
  verses: BibleVerse[];
}
export class ScriptureUnavailable extends Error {}

export const DEFAULT_DATASET = 'lit-tpv';
const directory = new URL('../../content/scripture/', import.meta.url);

/** Rejects anything but one complete, gap-free, duplicate-free chapter of 27 verses. */
export function validateScripture(dataset: ScriptureDataset): ScriptureDataset {
  const { verses } = dataset;
  if (!Array.isArray(verses) || verses.length !== VERSE_TOTAL)
    throw new Error(`Scripture dataset ${dataset.id} must contain exactly ${VERSE_TOTAL} verses.`);
  const texts = new Set<string>();
  verses.forEach((verse, index) => {
    if (verse.verseNumber !== index + 1)
      throw new Error(
        `Scripture dataset ${dataset.id}: verse ${index + 1} is missing or misplaced.`,
      );
    if (
      typeof verse.text !== 'string' ||
      verse.text.trim().length < 8 ||
      verse.text !== verse.text.trim()
    )
      throw new Error(
        `Scripture dataset ${dataset.id}: verse ${verse.verseNumber} has no clean text.`,
      );
    if (texts.has(verse.text)) throw new Error(`Scripture dataset ${dataset.id}: duplicate text.`);
    texts.add(verse.text);
    if (!verse.reference) throw new Error(`Scripture dataset ${dataset.id}: missing reference.`);
  });
  for (const key of [
    'translation',
    'reference',
    'sourceUrl',
    'license',
    'licenseUrl',
    'attribution',
  ] as const)
    if (!dataset[key]) throw new Error(`Scripture dataset ${dataset.id} is missing ${key}.`);
  return dataset;
}

const SAMPLE_WORDS = [
  'amber', 'willow', 'harbor', 'copper', 'meadow', 'lantern', 'granite', 'orchard', 'falcon',
  'ember', 'thistle', 'canyon', 'velvet', 'juniper', 'compass', 'marble', 'heron', 'saffron',
  'timber', 'glacier', 'bramble', 'pebble', 'cedar', 'anchor', 'quartz', 'sparrow', 'linen',
]; // prettier-ignore
/** A clearly labelled NON-Scripture deck for automated tests and mechanics-only play. */
export function createPlaceholderScripture(): ScriptureDataset {
  return validateScripture({
    id: 'fixture',
    language: 'en',
    translation: 'Placeholder test deck (not Scripture)',
    reference: 'Sample chapter',
    sourceUrl: 'about:blank',
    license: 'None — generated test data',
    licenseUrl: 'about:blank',
    attribution: 'Generated placeholder cards. No Bible text is included in this deck.',
    changes: 'Not applicable.',
    placeholder: true,
    verses: SAMPLE_WORDS.map((word, index) => ({
      verseNumber: index + 1,
      reference: `Sample ${index + 1}`,
      text: `[Placeholder — not Scripture] Sample card “${word}”. The real verse text is installed with pnpm scripture:import.`,
    })),
  });
}

/** Loads `content/scripture/proverbs-4.<id>.json`. `fixture` selects the placeholder deck. */
export function loadScripture(id = process.env.SCRIPTURE_DATASET || DEFAULT_DATASET) {
  if (id === 'fixture') return createPlaceholderScripture();
  if (!/^[a-z0-9-]+$/.test(id)) throw new ScriptureUnavailable('Invalid Scripture dataset name.');
  const file = fileURLToPath(new URL(`proverbs-4.${id}.json`, directory));
  if (!existsSync(file))
    throw new ScriptureUnavailable(
      `The Scripture dataset "${id}" is not installed. Run "pnpm scripture:import" on a machine that can reach ebible.org, or set SCRIPTURE_DATASET=fixture for a mechanics-only test deck.`,
    );
  return validateScripture(JSON.parse(readFileSync(file, 'utf8')) as ScriptureDataset);
}
