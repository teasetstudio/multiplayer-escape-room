import type { TeamId } from '../types/index.js';
import type { Rectangle, RoomId } from '../world/types.js';

export const LEVEL_COUNT = 5;
export const VERSE_TOTAL = 27;
/** Mandatory Scripture cards per level and team. Rows sum to 5, 5, 5, 6, 6; columns to 14 and 13. */
export const VERSE_PLAN: readonly Record<TeamId, number>[] = [
  { A: 3, B: 2 },
  { A: 2, B: 3 },
  { A: 3, B: 2 },
  { A: 3, B: 3 },
  { A: 3, B: 3 },
];
export const ARTIFACT_KINDS = ['key', 'medallion', 'crystal', 'coin', 'parchment'] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];
export const ARTIFACT_NAMES: Record<ArtifactKind, string> = {
  key: 'Ancient Key',
  medallion: 'Medallion',
  crystal: 'Crystal',
  coin: 'Coin',
  parchment: 'Parchment',
};
export const SYMBOLS = ['triangle', 'circle', 'square', 'diamond'] as const;
export type SymbolId = (typeof SYMBOLS)[number];
export const CHARACTERS = ['explorer', 'scout', 'traveler', 'ranger'] as const;

export type FixtureKind =
  | 'bookshelf'
  | 'chest'
  | 'cabinet'
  | 'barrel'
  | 'table'
  | 'pottery'
  | 'sack'
  | 'panel-x'
  | 'panel-y'
  | 'terminal-x'
  | 'switch-x'
  | 'button-x'
  | 'plate'
  | 'pedestal'
  | 'carving-x'
  | 'torch'
  | 'archway-x'
  | 'candle'
  | 'scroll'
  | 'artifact';
/** A public or (once revealed) hidden prop. Coordinates are logical world units. */
export interface Fixture extends Rectangle {
  id: string;
  kind: FixtureKind;
  solid: boolean;
  roomId?: RoomId;
  /** Display detail only, e.g. a pedestal's symbol or a loose artifact's kind. */
  detail?: string;
}
export type FixtureState = 'inactive' | 'active' | 'completed' | 'pressed';

/** Team-private puzzle information. Encoded as JSON in a view-filtered schema field. */
export type PuzzleView = { solved: boolean; fixtures: Record<string, FixtureState> } & (
  | { kind: 'code'; role: 'clue'; mapping: { symbol: SymbolId; digit: number }[] }
  | { kind: 'code'; role: 'entry'; symbols: SymbolId[]; attempts: number }
  | { kind: 'mirror'; role: 'switches'; switches: boolean[] }
  | { kind: 'mirror'; role: 'lamps'; lamps: boolean[]; target: boolean[] }
  | { kind: 'library'; role: 'clue'; parts: SymbolId[][] }
  | { kind: 'library'; role: 'pedestals'; progress: number; length: number }
  | {
      kind: 'balance';
      role: 'scale';
      weights: { value: number; placed: boolean }[];
      own: number;
      target: number;
      tilt: 'level' | TeamId;
      total: 'low' | 'high' | 'exact';
    }
  | {
      kind: 'mechanism';
      role: 'mechanism';
      switches: boolean[];
      /** The pattern the OTHER team must set; only this team can read it. */
      partnerPattern: boolean[];
      armed: boolean;
      partnerArmed: boolean;
      windowSeconds: number;
    }
);

export interface PromptMessage {
  id?: string;
  label?: string;
  hint?: string;
}
export interface PanelItem {
  id: string;
  kind: 'verse' | 'artifact';
  /** Full verse text. Never accompanied by a verse number. */
  text?: string;
  artifact?: ArtifactKind;
}
export type PanelMessage =
  | { type: 'container'; id: string; title: string; kind: FixtureKind; items: PanelItem[] }
  | { type: 'puzzle'; id: string; part?: number }
  | { type: 'none' };
export interface AreaMessage {
  /** Absent when the player is in a public room. */
  area?: {
    key: string;
    name: string;
    columns: number;
    rows: number;
    fixtures: Fixture[];
  };
}
export interface NoticeMessage {
  text: string;
  tone: 'info' | 'good' | 'warn';
}
export type BoardOp =
  | { op: 'place'; card: string; slot: number; expect: string }
  | { op: 'remove'; card: string }
  | { op: 'submit' };
export interface ChapterVerse {
  number: number;
  text: string;
}
export interface ChapterReveal {
  reference: string;
  translation: string;
  attribution: string;
  license: string;
  sourceUrl: string;
  verses: ChapterVerse[];
}
export interface PacingStats {
  levels: { level: number; puzzleSeconds: number; versesSeconds: number; totalSeconds: number }[];
  finalSeconds?: number;
  totalSeconds?: number;
}
