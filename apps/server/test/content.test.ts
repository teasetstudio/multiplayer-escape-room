import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEVELS, LEVEL_MAPS, VERSE_PLAN, VERSE_TOTAL, type BoardOp } from '@escape/shared';
import {
  DEFAULT_DATASET,
  ScriptureUnavailable,
  createPlaceholderScripture,
  loadScripture,
  validateScripture,
} from '../src/content/scripture.js';
import { SECRETS } from '../src/content/secrets.js';
import { WisdomBoard } from '../src/systems/board.js';
import { createPlacement, hidingPlaces, validatePlacement } from '../src/systems/placement.js';
import {
  BalancePuzzle,
  LibraryPuzzle,
  MECHANISM_WINDOW_MS,
  MechanismPuzzle,
  MirrorPuzzle,
  SecretCodePuzzle,
} from '../src/systems/puzzles.js';
import { createRng } from '../src/systems/rng.js';

const deck = createPlaceholderScripture();

test('a Scripture dataset must be one complete chapter: 27 numbered, distinct, non-empty verses', () => {
  assert.equal(deck.verses.length, VERSE_TOTAL);
  assert.deepEqual(
    deck.verses.map((verse) => verse.verseNumber),
    Array.from({ length: 27 }, (_, index) => index + 1),
  );
  const broken = (change: (verses: typeof deck.verses) => void) => {
    const verses = deck.verses.map((verse) => ({ ...verse }));
    change(verses);
    return () => validateScripture({ ...deck, verses });
  };
  assert.throws(
    broken((verses) => verses.pop()),
    /exactly 27/,
  );
  assert.throws(
    broken((verses) => (verses[4]!.verseNumber = 4)),
    /missing or misplaced/,
  );
  assert.throws(
    broken((verses) => (verses[9]!.text = '  ')),
    /no clean text/,
  );
  assert.throws(
    broken((verses) => (verses[9]!.text = verses[8]!.text)),
    /duplicate/,
  );
  assert.throws(() => validateScripture({ ...deck, attribution: '' }), /attribution/);
  assert.throws(() => loadScripture('../../etc/passwd'), ScriptureUnavailable);
  assert.throws(() => loadScripture('not-installed'), /not installed/);
});

test('the installed Proverbs 4 translation, when present, is complete, attributed and in order', (t) => {
  const file = fileURLToPath(
    new URL(`../content/scripture/proverbs-4.${DEFAULT_DATASET}.json`, import.meta.url),
  );
  if (!existsSync(file)) {
    t.skip('The licensed Scripture dataset has not been imported (pnpm scripture:import).');
    return;
  }
  const scripture = loadScripture(DEFAULT_DATASET);
  assert.equal(scripture.placeholder, undefined);
  assert.equal(scripture.verses.length, 27);
  assert.match(scripture.license, /Attribution-ShareAlike 4\.0|CC BY-SA 4\.0/);
  assert.match(scripture.sourceUrl, /^https:\/\/ebible\.org\/lit\//);
  assert.ok(scripture.attribution.length > 10 && scripture.changes.length > 5);
  scripture.verses.forEach((verse, index) => {
    assert.equal(verse.verseNumber, index + 1);
    assert.ok(!/^\d/.test(verse.text), 'Verse text carries no leading verse number');
    assert.ok(verse.reference.endsWith(`4:${index + 1}`));
  });
});

test('all five public maps load and no hidden chamber is part of any client-compiled geometry', () => {
  assert.equal(LEVEL_MAPS.length, 5);
  assert.equal(new Set(LEVEL_MAPS.map((map) => map.id)).size, 5);
  const publicJson = JSON.stringify(LEVELS);
  for (const secrets of SECRETS)
    for (const team of ['A', 'B'] as const) {
      const area = secrets.areas[team];
      assert.ok(!publicJson.includes(area.id), 'Hidden chamber IDs are server-only');
      assert.ok(!publicJson.includes(area.name));
      // The entrance is an ordinary public prop of the team's own room, never a shared wall.
      const entrance = LEVELS[secrets.level - 1]!.fixtures.find(
        (entry) => entry.id === area.entranceObjectId,
      )!;
      assert.equal(entrance.roomId, area.parentRoomId);
      assert.equal(entrance.roomId, LEVELS[secrets.level - 1]!.rooms[team].id);
    }
});

test('the hiding plan gives 5/5/5/6/6 verses per level, 14 for Team A and 13 for Team B', () => {
  const verses = hidingPlaces().filter((slot) => slot.content === 'verse');
  assert.equal(verses.length, 27);
  VERSE_PLAN.forEach((plan, index) => {
    for (const team of ['A', 'B'] as const)
      assert.equal(
        verses.filter((slot) => slot.level === index + 1 && slot.team === team).length,
        plan[team],
      );
  });
  assert.deepEqual(
    VERSE_PLAN.map((plan) => plan.A + plan.B),
    [5, 5, 5, 6, 6],
  );
  // Variety: chambers, cabinets, chests, bookshelves and loose scrolls are all used.
  const kinds = new Set(
    verses.map(
      (slot) => `${slot.area ? 'hidden' : 'public'}:${slot.container?.split('-').pop() ?? 'loose'}`,
    ),
  );
  assert.ok(kinds.size >= 6, [...kinds].join());
});

test('seeded placement is deterministic, shuffled, complete and every card is reachable', () => {
  const first = createPlacement(deck, createRng('seed-1'));
  const again = createPlacement(deck, createRng('seed-1'));
  const other = createPlacement(deck, createRng('seed-2'));
  assert.deepEqual(first, again);
  assert.notDeepEqual(
    first.map((item) => item.verseNumber),
    other.map((item) => item.verseNumber),
  );
  for (const items of [first, other]) {
    const report = validatePlacement(items);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.perLevel, [5, 5, 5, 6, 6]);
    assert.deepEqual(report.perTeam, { A: 14, B: 13 });
    const verses = items.filter((item) => item.type === 'verse');
    assert.deepEqual(
      verses.map((item) => item.verseNumber!).sort((a, b) => a - b),
      Array.from({ length: 27 }, (_, index) => index + 1),
    );
    // Not dealt in biblical order: level 1 must not simply hold verses 1–5.
    const levelOne = verses.filter((item) => item.level === 1).map((item) => item.verseNumber);
    assert.notDeepEqual([...levelOne].sort(), [1, 2, 3, 4, 5]);
    // Opaque IDs: unique, unrelated to the verse number, and not sorted like the chapter.
    assert.equal(new Set(items.map((item) => item.id)).size, items.length);
    const byId = [...verses]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((item) => item.verseNumber);
    assert.notDeepEqual(
      byId,
      [...byId].sort((a, b) => a! - b!),
    );
  }
  // The validator notices duplicated, missing and unreachable cards.
  const duplicate = first.map((item) => ({ ...item }));
  duplicate.find((item) => item.verseNumber === 2)!.verseNumber = 1;
  assert.ok(
    validatePlacement(duplicate).errors.some((error) => /Verse 2 is not placed/.test(error)),
  );
  const walled = first.map((item) => ({ ...item }));
  const loose = walled.find((item) => item.point && !item.area)!;
  loose.point = { x: 3, y: 3 };
  assert.ok(validatePlacement(walled).errors.some((error) => /unreachable/.test(error)));
});

test('Secret Code: only Team B can enter the code that Team A can read', () => {
  const puzzle = new SecretCodePuzzle(1, createRng('code'));
  const a = puzzle.view('A', 0);
  const b = puzzle.view('B', 0);
  assert.ok(a.kind === 'code' && a.role === 'clue' && b.kind === 'code' && b.role === 'entry');
  assert.ok(!JSON.stringify(b).includes('digit'), 'The entry side never receives the mapping');
  const code = b.symbols.map((s) => a.mapping.find((m) => m.symbol === s)!.digit).join('');
  assert.equal(code, puzzle.solution());
  const wrong = code === '1111' ? '2222' : '1111';
  assert.equal(puzzle.act('A', 'x', { code }).changed, undefined);
  assert.equal(puzzle.act('B', 'x', { code: wrong }).notice?.tone, 'warn');
  assert.equal(puzzle.act('B', 'x', { code: 'abcd' }).changed, undefined);
  assert.equal(puzzle.solved, false);
  puzzle.act('B', 'x', { code });
  assert.equal(puzzle.solved, true);
});

test('Mirror Mechanisms: every generated combination is solvable from the switches', () => {
  for (let seed = 0; seed < 40; seed++) {
    const puzzle = new MirrorPuzzle(2, createRng(`mirror-${seed}`));
    const lamps = puzzle.view('B', 0);
    assert.ok(lamps.kind === 'mirror' && lamps.role === 'lamps');
    assert.notDeepEqual(lamps.lamps, lamps.target, 'Never starts solved');
    assert.ok(!('switches' in lamps));
    puzzle.solution().forEach((on, index) => {
      if (on) puzzle.interact('A', `l2-a-switch-${index + 1}`);
    });
    assert.equal(puzzle.solved, true, `seed ${seed}`);
  }
  const puzzle = new MirrorPuzzle(2, createRng('mirror'));
  assert.deepEqual(
    puzzle.interact('B', 'l2-a-switch-1'),
    { panel: {} },
    'Team B cannot pull levers',
  );
});

test('Ancient Library: the order is validated on the server and a wrong press resets it', () => {
  const puzzle = new LibraryPuzzle(3, createRng('library'));
  const order = puzzle.solution();
  const clue = puzzle.view('A', 0);
  assert.ok(clue.kind === 'library' && clue.role === 'clue');
  assert.deepEqual(clue.parts.flat(), order);
  assert.ok(!JSON.stringify(puzzle.view('B', 0)).includes(order[0]!));
  const press = (symbol: string) =>
    puzzle.interact(
      'B',
      `l3-b-pedestal-${['triangle', 'circle', 'square', 'diamond'].indexOf(symbol) + 1}`,
    );
  press(order[0]!);
  press(order[1]!);
  const wrong = ['triangle', 'circle', 'square', 'diamond'].find(
    (s) => s !== order[2] && s !== order[0],
  )!;
  assert.equal(press(wrong).notice?.tone, 'warn');
  const view = puzzle.view('B', 0);
  assert.ok(view.kind === 'library' && view.role === 'pedestals' && view.progress === 0);
  order.forEach(press);
  assert.equal(puzzle.solved, true);
});

test('Balance Chamber: small integers, both pans level at the shared target', () => {
  for (let seed = 0; seed < 25; seed++) {
    const puzzle = new BalancePuzzle(4, createRng(`balance-${seed}`));
    const { A, B, target } = puzzle.solution();
    const place = (team: 'A' | 'B', values: number[]) => {
      const view = puzzle.view(team, 0);
      assert.ok(view.kind === 'balance');
      assert.ok(view.weights.every((weight) => weight.value >= 1 && weight.value <= 9));
      for (const value of values)
        puzzle.act(team, 'x', {
          weight: view.weights.findIndex((weight) => weight.value === value),
        });
    };
    place('A', A);
    assert.equal(puzzle.solved, false, 'One team alone cannot balance the beam');
    place('B', B);
    assert.equal(puzzle.solved, true);
    assert.equal(A.reduce((s, v) => s + v, 0) * 2, target);
  }
});

test('Final Mechanism: cross-team patterns and a forgiving server-timed window', () => {
  const make = () => {
    const puzzle = new MechanismPuzzle(5, createRng('mechanism'));
    const pattern = puzzle.solution();
    for (const team of ['A', 'B'] as const) {
      const view = puzzle.view(team, 0);
      const other = team === 'A' ? 'B' : 'A';
      assert.ok(view.kind === 'mechanism');
      assert.deepEqual(view.partnerPattern, pattern[other], 'Each team reads the OTHER pattern');
    }
    return { puzzle, pattern };
  };
  const set = (puzzle: MechanismPuzzle, pattern: Record<'A' | 'B', boolean[]>) => {
    for (const team of ['A', 'B'] as const)
      pattern[team].forEach((on, i) => {
        if (on) puzzle.interact(team, `l5-${team.toLowerCase()}-switch-${i + 1}`, 0);
      });
  };
  const late = make();
  set(late.puzzle, late.pattern);
  late.puzzle.interact('A', 'l5-a-button', 1000);
  late.puzzle.interact('B', 'l5-b-button', 1000 + MECHANISM_WINDOW_MS + 1);
  assert.equal(late.puzzle.solved, false, 'Too far apart');
  assert.equal(late.puzzle.tick(1000 + 2 * MECHANISM_WINDOW_MS + 2), true);
  const jammed = make();
  jammed.puzzle.interact('A', 'l5-a-button', 0);
  assert.equal(jammed.puzzle.interact('B', 'l5-b-button', 10).notice?.tone, 'warn');
  assert.equal(jammed.puzzle.solved, false, 'Wrong switches jam the mechanism');
  const good = make();
  set(good.puzzle, good.pattern);
  good.puzzle.interact('B', 'l5-b-button', 5000);
  good.puzzle.interact('A', 'l5-a-button', 5000 + MECHANISM_WINDOW_MS - 500);
  assert.equal(good.puzzle.solved, true, 'A few seconds apart is close enough');
});

test('the final board conserves all 27 cards under placement, swaps, removal and stale moves', () => {
  const canonical = Array.from({ length: 27 }, (_, i) => `card-${(i * 7) % 27}`);
  const tray = [...canonical].reverse();
  assert.throws(() => new WisdomBoard(tray.slice(1), canonical));
  assert.throws(() => new WisdomBoard([...tray.slice(1), tray[1]!], canonical));
  const board = new WisdomBoard(tray, canonical);
  const place = (card: string, slot: number, expect = board.slots[slot]!) =>
    board.apply({ op: 'place', card, slot, expect } satisfies BoardOp);
  assert.deepEqual(board.apply({ op: 'submit' }), { ok: false, reason: 'incomplete' });
  assert.equal(place(tray[0]!, 3).ok, true);
  assert.equal(place(tray[1]!, 3, '').ok, false, 'A stale view of slot 3 is rejected');
  assert.equal(board.slots[3], tray[0]);
  assert.equal(place(tray[1]!, 5).ok, true);
  place(tray[0]!, 5); // swap two placed cards
  assert.deepEqual([board.slots[3], board.slots[5]], [tray[1], tray[0]]);
  place(tray[2]!, 5); // a tray card displaces the occupant back to the tray
  assert.ok(board.unplaced().includes(tray[0]!));
  board.apply({ op: 'remove', card: tray[2]! });
  assert.equal(board.slots[5], '');
  for (const bad of [
    null,
    {},
    { op: 'place', card: 'nope', slot: 0, expect: '' },
    { op: 'place', card: tray[0], slot: 27, expect: '' },
    { op: 'place', card: tray[0], slot: 1.5, expect: '' },
    { op: 'swap' },
  ])
    assert.equal(board.apply(bad).ok, false);
  // Hundreds of arbitrary interleaved operations from "different players".
  const rng = createRng('board');
  for (let i = 0; i < 600; i++) {
    const card = tray[Math.floor(rng() * 27)]!;
    const slot = Math.floor(rng() * 27);
    if (rng() < 0.2) board.apply({ op: 'remove', card });
    else
      board.apply({ op: 'place', card, slot, expect: rng() < 0.8 ? board.slots[slot]! : 'stale' });
    assert.ok(board.consistent());
  }
  // Fill the board in a wrong order: rejected with a count, board intact.
  for (const card of tray) board.apply({ op: 'remove', card });
  tray.forEach((card, slot) => place(card, slot));
  const before = [...board.slots];
  const wrong = board.apply({ op: 'submit' });
  assert.ok(wrong.ok && wrong.wrong && !board.solved);
  assert.deepEqual(board.slots, before);
  assert.equal(board.correct, canonical.filter((id, i) => tray[i] === id).length);
  canonical.forEach((card, slot) => place(card, slot));
  assert.ok(board.consistent());
  const solved = board.apply({ op: 'submit' });
  assert.ok(solved.ok && solved.solved && board.solved);
  assert.deepEqual(
    board.apply({ op: 'submit' }),
    { ok: false, reason: 'closed' },
    'No second victory',
  );
  assert.equal(place(tray[0]!, 0).ok, false);
});

test('the importer strips only formatting artifacts and refuses anything unexpected', async () => {
  // @ts-expect-error The importer is a plain Node script without type declarations.
  const importer = (await import('../../../scripts/import-scripture.mjs')) as {
    parseChapter(html: string, expected?: number): { verseNumber: number; text: string }[];
    parseCopyright(html: string): { title: string; holder: string };
    buildDataset(chapter: string, copyright: string): ScriptureLike;
  };
  type ScriptureLike = Parameters<typeof validateScripture>[0];
  // A synthetic page in the eBible/Haiola layout. The wording is test filler, not Scripture.
  const line = (n: number) =>
    `Filler sentence number ${'abcdefghijklmnopqrstuvwxyzA'[n - 1]} of the page`;
  const verse = (n: number) =>
    `<div class='q'><span class="verse" id="V${n}">${n}&#160;</span>${line(n)},</div>\n` +
    `<div class='q2'>with a &#8222;quoted&#8220; second line${
      n === 3
        ? '<a href="#FN1" class="notemark">*<span class="popup">A note, not text.</span></a>'
        : ''
    } &amp; more.</div>`;
  const pageHtml = (count: number) => `<html><head><title>Page</title></head><body>
    <ul class='tnav'><li><a href="PRO03.htm">&lt;</a></li><li><a href="PRO05.htm">&gt;</a></li></ul>
    <div class="main"><div class='mt'>Book title</div><div class='chapterlabel' id="V0"> 4</div>
    <div class='s'>A heading that is not Scripture</div>
    ${Array.from({ length: count }, (_, i) => verse(i + 1)).join('\n')}
    <ul class='tnav'><li><a href="PRO05.htm">&gt;</a></li></ul>
    <div class="footnote"><p class="f" id="FN1">4:3 A note, not text.</p></div>
    <div class="copyright"><p>Footer</p></div></div></body></html>`;
  const verses = importer.parseChapter(pageHtml(27));
  assert.equal(verses.length, 27);
  assert.equal(verses[2]!.text, `${line(3)}, with a „quoted“ second line & more.`);
  assert.ok(verses.every((entry) => !/note|heading|Footer|\d/.test(entry.text)));
  assert.throws(() => importer.parseChapter(pageHtml(26)), /Expected 27 verses/);
  assert.throws(() => importer.parseChapter('<p>nothing</p>'), /main/);
  assert.throws(
    () => importer.parseChapter(pageHtml(27).replace('id="V5">', 'id="V6">')),
    /missing or out of order/,
  );
  const rights =
    '<html><head><title>Sample Translation</title></head><body><p>Copyright © 2020 Sample Holder.</p>' +
    '<a href="http://creativecommons.org/licenses/by-sa/4.0/">Creative Commons Attribution-ShareAlike 4.0</a></body></html>';
  assert.equal(importer.parseCopyright(rights).title, 'Sample Translation');
  assert.throws(
    () => importer.parseCopyright('<p>All rights reserved. Copyright Nobody.</p>'),
    /CC BY-SA 4\.0/,
  );
  const dataset = validateScripture(importer.buildDataset(pageHtml(27), rights));
  assert.equal(dataset.verses[26]!.reference, 'Patarlių 4:27');
  assert.match(dataset.attribution, /Sample Holder/);
  assert.match(dataset.license, /Attribution-ShareAlike 4\.0/);
});
