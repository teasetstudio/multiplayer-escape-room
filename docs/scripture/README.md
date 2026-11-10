# Scripture content — Proverbs 4

The secondary quest, **The Lost Words of Wisdom**, uses all 27 verses of Proverbs chapter 4.
Scripture text is _content_, kept apart from game logic and from the client bundle.

## Source and licence

|                |                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Translation    | Tikinčiųjų paveldo vertimas (TPV), Lithuanian                                                                               |
| Chapter page   | <https://ebible.org/lit/PRO04.htm>                                                                                          |
| Copyright page | <https://ebible.org/lit/copyright.htm>                                                                                      |
| Licence        | Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0), <https://creativecommons.org/licenses/by-sa/4.0/> |

## Current status of the dataset

**The verse text is not committed yet.** The environment this iteration was built in could not
reach `ebible.org` (the host was denied by the sandbox network policy), and Bible text is never
written from memory, paraphrased or invented in this project. Until the import below has been
run, a session cannot be started with the default dataset; the host is shown the reason.

Everything else is in place: the loader, validation, importer, verifier, tests and UI. To install
the text, on any machine that can reach ebible.org:

```sh
pnpm scripture:import   # writes apps/server/content/scripture/proverbs-4.lit-tpv.json
pnpm scripture:verify   # re-downloads the page and compares all 27 verses
pnpm test               # the dataset test now runs instead of being skipped
```

Offline alternative: save the two pages with a browser and run
`node scripts/import-scripture.mjs --chapter PRO04.htm --copyright copyright.htm`.

Commit the generated JSON file. The **Scripture source** GitHub Actions workflow re-verifies the
committed text against ebible.org whenever the dataset or the importer changes.

## What the importer does — and refuses to do

`scripts/import-scripture.mjs` reads the chapter page and keeps the verse wording exactly as
published. It removes only formatting artifacts that are not part of the wording:

- verse-number markers (the number is stored separately as server metadata);
- footnote callers, their pop-ups and the footnote block;
- book/section headings, the chapter label and page navigation;
- poetry line breaks and indentation, which are joined with single spaces.

It aborts — rather than guessing — when the page does not yield exactly 27 verses numbered
1–27, when a verse is suspiciously short, duplicated or still contains markup, digits at the
start or footnote symbols, or when the copyright page does not state CC BY-SA 4.0. The licence
is read from the translation's own copyright page; the copyright statement found there becomes
the attribution string and the first part of that page is stored as `copyrightNotice`.

These changes are recorded in the dataset's `changes` field, which satisfies the licence's
"indicate if changes were made" condition.

## Licence obligations (review)

- **Attribution.** The translation name, licence and source URL are shown in the game wherever
  verse text is shown (the collection, the Hall of Wisdom, the revealed chapter). The full
  attribution and copyright statement are shown with the revealed chapter and stored in the
  dataset.
- **Indicate changes.** See above; in play the verses appear one per card, unnumbered and
  shuffled, which is a presentation of unmodified wording.
- **ShareAlike.** If the dataset file, or any adaptation of the verse text, is distributed, it
  must be offered under CC BY-SA 4.0 (or a compatible licence). The JSON dataset is therefore
  distributed under CC BY-SA 4.0. The game's source code and artwork are separate works that
  merely display the text and are not themselves adaptations of it.
- **No additional restrictions.** Do not add terms or technical measures that stop others from
  doing what the licence permits with the text.

This is an engineering review of the published licence terms, not legal advice. Re-check the
copyright page when updating the dataset.

## Data model

```ts
interface BibleVerse {
  verseNumber: number; // canonical, server-only until victory
  text: string;
  reference: string;
}
```

`apps/server/src/content/scripture.ts` loads and validates
`apps/server/content/scripture/proverbs-4.<id>.json`. `SCRIPTURE_DATASET` selects another
dataset id, so a further translation is one more JSON file with the same shape.

### Placeholder deck

`SCRIPTURE_DATASET=fixture` selects a built-in deck of 27 cards that are plainly labelled
"Placeholder — not Scripture". Automated tests use it so that game rules can be verified without
Bible text, and it allows a mechanics-only playtest. It is never used unless selected explicitly.

## Secrecy during play

- Verse numbers exist only in server memory. Card IDs are random per session and neither IDs nor
  any client-visible ordering encode the number.
- A verse's text is sent to a player only when that player inspects it, and to the shared
  collection once it has been collected. The host monitor receives verse text only in the final
  stage.
- The numbered chapter is sent exactly once: after the server has validated the final order.
