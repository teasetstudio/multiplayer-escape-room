// Imports (or verifies) the Proverbs 4 dataset from the official eBible.org pages.
//
//   pnpm scripture:import            fetch, validate and write the dataset
//   pnpm scripture:verify            fetch again and compare with the installed dataset
//   node scripts/import-scripture.mjs --chapter PRO04.htm --copyright copyright.htm
//                                    import from pages saved with a browser (offline)
//
// The script never invents or repairs text: anything unexpected aborts the import.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SOURCE = {
  id: 'lit-tpv',
  language: 'lt',
  chapterUrl: 'https://ebible.org/lit/PRO04.htm',
  copyrightUrl: 'https://ebible.org/lit/copyright.htm',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  license: 'Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)',
  book: 'Patarlių',
  verses: 27,
};
const datasetPath = fileURLToPath(
  new URL(`../apps/server/content/scripture/proverbs-4.${SOURCE.id}.json`, import.meta.url),
);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
export function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}
const plain = (html) =>
  decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/[ \s]+/g, ' ')
    .trim();

/** Removes an element (and its nested same-name children) whose opening tag matches. */
function dropElements(html, tag, isTarget) {
  const open = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
  let result = '';
  let cursor = 0;
  for (let match = open.exec(html); match; match = open.exec(html)) {
    if (match.index < cursor || !isTarget(match[0])) continue;
    const any = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
    any.lastIndex = match.index + match[0].length;
    let depth = 1;
    let end = html.length;
    for (let inner = any.exec(html); inner; inner = any.exec(html)) {
      depth += inner[1] ? -1 : 1;
      if (depth === 0) {
        end = inner.index + inner[0].length;
        break;
      }
    }
    result += html.slice(cursor, match.index);
    cursor = end;
    open.lastIndex = end;
  }
  return result + html.slice(cursor);
}
const hasClass = (names) => (tag) => {
  const value = /class\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
  return value.split(/\s+/).some((name) => names.includes(name));
};

/** Parses one eBible (Haiola) chapter page into verse records.
 * Formatting artifacts that are not Scripture wording are removed: verse-number markers,
 * footnote callers and their pop-ups, footnote blocks, headings, navigation, poetry line
 * breaks and indentation. The wording itself is never altered. */
export function parseChapter(html, expected = SOURCE.verses) {
  const start = html.search(/<div[^>]*class\s*=\s*["']main["']/i);
  if (start < 0) throw new Error('The chapter page has no <div class="main"> block.');
  let body = html.slice(start);
  body = dropElements(body, 'a', hasClass(['notemark']));
  body = dropElements(body, 'span', hasClass(['popup']));
  body = dropElements(body, 'ul', hasClass(['tnav']));
  body = dropElements(
    body,
    'div',
    hasClass([
      'footnote',
      'copyright',
      'tnav',
      's',
      's1',
      's2',
      'mt',
      'mt1',
      'mt2',
      'ms',
      'r',
      'd',
      'chapterlabel',
    ]),
  );
  const marker =
    /<span[^>]*class\s*=\s*["']verse["'][^>]*id\s*=\s*["']V(\d+)["'][^>]*>[\s\S]*?<\/span>/gi;
  const marks = [...body.matchAll(marker)];
  const verses = marks.map((mark, index) => {
    const from = mark.index + mark[0].length;
    const to = marks[index + 1]?.index ?? body.length;
    return { verseNumber: Number(mark[1]), text: plain(body.slice(from, to)) };
  });
  if (verses.length !== expected)
    throw new Error(`Expected ${expected} verses on the page, found ${verses.length}.`);
  verses.forEach((verse, index) => {
    if (verse.verseNumber !== index + 1)
      throw new Error(`Verse ${index + 1} is missing or out of order on the page.`);
    if (verse.text.length < 15) throw new Error(`Verse ${verse.verseNumber} looks truncated.`);
    if (/^[\d\s]|[<>]|[*†‡]|\bV\d+\b/.test(verse.text))
      throw new Error(
        `Verse ${verse.verseNumber} still contains formatting artifacts: ${verse.text}`,
      );
  });
  if (new Set(verses.map((verse) => verse.text)).size !== expected)
    throw new Error('Two verses have identical text; the page was not parsed correctly.');
  return verses;
}

/** Confirms the licence from the translation's own copyright page; never assumes it. */
export function parseCopyright(html) {
  const text = plain(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' '));
  if (
    !/creativecommons\.org\/licenses\/by-sa\/4\.0/i.test(html) &&
    !/Attribution-ShareAlike\s+4\.0/i.test(text)
  )
    throw new Error(
      'The copyright page does not state CC BY-SA 4.0. Review the licence before using this text.',
    );
  const title = plain(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '');
  const holder = /(?:Copyright|©)\s*[^.]{3,160}\./i.exec(text)?.[0];
  if (!holder) throw new Error('No copyright statement found on the copyright page.');
  return { title, holder: holder.trim(), notice: text.slice(0, 1500) };
}

export function buildDataset(chapterHtml, copyrightHtml, retrievedAt = new Date().toISOString()) {
  const verses = parseChapter(chapterHtml);
  const rights = parseCopyright(copyrightHtml);
  const translation = rights.title || 'Tikinčiųjų paveldo vertimas (TPV)';
  return {
    id: SOURCE.id,
    language: SOURCE.language,
    translation,
    reference: `${SOURCE.book} 4`,
    sourceUrl: SOURCE.chapterUrl,
    copyrightUrl: SOURCE.copyrightUrl,
    license: SOURCE.license,
    licenseUrl: SOURCE.licenseUrl,
    attribution: `${translation}. ${rights.holder} Source: ${SOURCE.chapterUrl}. Licensed under CC BY-SA 4.0.`,
    changes:
      'Verse wording is unchanged. Removed from the web page: verse-number markers, footnote callers and footnotes, headings and navigation; poetry line breaks and indentation were joined into single spaces. In the game the verses are shown one per card, without numbers and in shuffled order until the final puzzle is solved.',
    copyrightNotice: rights.notice,
    retrievedAt,
    sourceSha256: createHash('sha256').update(chapterHtml).digest('hex'),
    verses: verses.map((verse) => ({
      verseNumber: verse.verseNumber,
      reference: `${SOURCE.book} 4:${verse.verseNumber}`,
      text: verse.text,
    })),
  };
}

async function page(url, file) {
  if (file) return readFileSync(file, 'utf8');
  const response = await fetch(url, {
    headers: { 'User-Agent': 'scripture-import (+ebible.org)' },
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  return response.text();
}
async function main(args) {
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const chapter = await page(SOURCE.chapterUrl, option('--chapter'));
  const copyright = await page(SOURCE.copyrightUrl, option('--copyright'));
  const dataset = buildDataset(chapter, copyright);
  if (args.includes('--verify')) {
    if (!existsSync(datasetPath)) throw new Error('No dataset is installed; run the import first.');
    const installed = JSON.parse(readFileSync(datasetPath, 'utf8'));
    const differences = dataset.verses.filter(
      (verse, index) => installed.verses?.[index]?.text !== verse.text,
    );
    if (differences.length || installed.verses?.length !== dataset.verses.length)
      throw new Error(
        `The installed dataset differs from ${SOURCE.chapterUrl} in verse(s) ${differences.map((verse) => verse.verseNumber).join(', ') || '(count)'}.`,
      );
    console.log(`Verified: all ${dataset.verses.length} verses match ${SOURCE.chapterUrl}.`);
    return;
  }
  writeFileSync(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`);
  console.log(`Wrote ${dataset.verses.length} verses to ${datasetPath}`);
  console.log(dataset.attribution);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main(process.argv.slice(2)).catch((error) => {
    console.error(`Scripture import failed: ${error.message}`);
    process.exit(1);
  });
