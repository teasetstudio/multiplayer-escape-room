import {
  LEVELS,
  fixture,
  fixtureId,
  type ArtifactKind,
  type Fixture,
  type FixtureKind,
  type Point,
  type RoomId,
  type TeamId,
} from '@escape/shared';

/** SERVER-ONLY level content. Nothing in this file is compiled into the client bundle:
 * hidden chambers, what each container holds and where loose items lie are revealed to a
 * player only through targeted messages once that player has earned them. */

export type Content = 'verse' | ArtifactKind;
type Spec = [id: string, kind: FixtureKind, x: number, y: number];
interface AreaTemplate {
  name: string;
  columns: number;
  rows: number;
  spawn: Point;
  /** `exit` is the way back; `c1`/`c2` are searchable containers; the rest is decoration. */
  fixtures: Spec[];
  loose: Point[];
}
const TEMPLATES = {
  vault: {
    name: 'Hidden Vault',
    columns: 5,
    rows: 4,
    spawn: { x: 160, y: 205 },
    fixtures: [
      ['exit', 'archway-x', 117, 238],
      ['c1', 'chest', 136, 10],
      ['c2', 'cabinet', 262, 70],
      ['barrel', 'barrel', 14, 14],
      ['pottery', 'pottery', 14, 196],
      ['candle', 'candle', 280, 20],
    ],
    loose: [
      { x: 80, y: 130 },
      { x: 235, y: 160 },
    ],
  },
  study: {
    name: 'Forgotten Study',
    columns: 6,
    rows: 4,
    spawn: { x: 192, y: 205 },
    fixtures: [
      ['exit', 'archway-x', 149, 238],
      ['c1', 'bookshelf', 40, 10],
      ['c2', 'cabinet', 300, 10],
      ['table', 'table', 152, 96],
      ['candle', 'candle', 180, 20],
    ],
    loose: [
      { x: 60, y: 180 },
      { x: 320, y: 170 },
    ],
  },
  storeroom: {
    name: 'Dusty Storeroom',
    columns: 4,
    rows: 5,
    spawn: { x: 128, y: 268 },
    fixtures: [
      ['exit', 'archway-x', 85, 302],
      ['c1', 'chest', 14, 70],
      ['c2', 'cabinet', 200, 130],
      ['barrel-1', 'barrel', 14, 14],
      ['barrel-2', 'barrel', 56, 14],
      ['sack', 'sack', 200, 14],
    ],
    loose: [
      { x: 120, y: 150 },
      { x: 60, y: 230 },
    ],
  },
  alcove: {
    name: 'Secret Alcove',
    columns: 3,
    rows: 3,
    spawn: { x: 96, y: 140 },
    fixtures: [
      ['exit', 'archway-x', 53, 174],
      ['c1', 'chest', 130, 14],
      ['pottery', 'pottery', 14, 14],
    ],
    loose: [{ x: 60, y: 90 }],
  },
} satisfies Record<string, AreaTemplate>;

export interface HiddenAreaDefinition {
  id: string;
  levelId: number;
  team: TeamId;
  parentRoomId: RoomId;
  /** A PUBLIC prop that secretly is the way in. */
  entranceObjectId: string;
  hint: string;
  name: string;
  columns: number;
  rows: number;
  spawn: Point;
  /** Where the player reappears in the public room. */
  returnTo: Point;
  fixtures: Fixture[];
  exitId: string;
  containers: { fixtureId: string; content?: Content }[];
  loose: { point: Point; content: Content }[];
}
export interface LevelSecrets {
  level: number;
  areas: Record<TeamId, HiddenAreaDefinition>;
  publicContainers: Record<TeamId, { fixtureId: string; content: Content }[]>;
  publicLoose: Record<TeamId, { point: Point; content: ArtifactKind }[]>;
}

const HINTS: Partial<Record<FixtureKind, string>> = {
  bookshelf: 'One book on this shelf sticks out oddly…',
  'carving-x': 'This carved stone is worn smooth, as if pressed many times…',
  cabinet: 'The back of this old wardrobe sounds hollow…',
  torch: 'This torch bracket looks loose…',
};

interface TeamPlan {
  entrance: string;
  template: keyof typeof TEMPLATES;
  /** Contents of c1, c2 and the loose spots of the hidden chamber. */
  c1?: Content;
  c2?: Content;
  loose?: (Content | undefined)[];
  /** Public containers (fixture name → content). */
  open: Record<string, Content>;
  /** A loose artifact in the public room, room-local coordinates. */
  floor: [x: number, y: number, kind: ArtifactKind];
}
// The deliberate hiding plan: 27 "verse" entries, 5/5/5/6/6 per level, 14 for A and 13 for B.
const PLAN: Record<TeamId, TeamPlan>[] = [
  {
    A: { entrance: 'shelf', template: 'vault', c1: 'verse', loose: ['verse', 'medallion'], open: { chest: 'verse' }, floor: [700, 730, 'coin'] },
    B: { entrance: 'carving', template: 'alcove', c1: 'coin', loose: ['verse'], open: { cabinet: 'verse' }, floor: [60, 720, 'key'] },
  },
  {
    A: { entrance: 'wardrobe', template: 'storeroom', c1: 'crystal', c2: 'verse', open: { shelf: 'verse' }, floor: [60, 640, 'parchment'] },
    B: { entrance: 'torch', template: 'study', c1: 'verse', c2: 'verse', loose: ['key'], open: { chest: 'verse' }, floor: [60, 640, 'medallion'] },
  },
  {
    A: { entrance: 'shelf-2', template: 'study', c1: 'verse', c2: 'parchment', loose: [undefined, 'verse'], open: { cabinet: 'verse' }, floor: [60, 780, 'crystal'] },
    B: { entrance: 'carving', template: 'vault', c1: 'verse', loose: ['medallion'], open: { 'shelf-1': 'verse' }, floor: [700, 600, 'coin'] },
  },
  {
    A: { entrance: 'torch', template: 'storeroom', c1: 'verse', c2: 'verse', loose: ['coin'], open: { chest: 'verse' }, floor: [820, 700, 'key'] },
    B: { entrance: 'shelf', template: 'vault', c1: 'crystal', c2: 'verse', loose: ['verse'], open: { cabinet: 'verse' }, floor: [820, 700, 'parchment'] },
  },
  {
    A: { entrance: 'carving', template: 'study', c1: 'key', c2: 'verse', loose: ['verse'], open: { shelf: 'verse' }, floor: [60, 760, 'medallion'] },
    B: { entrance: 'wardrobe', template: 'storeroom', c1: 'verse', c2: 'parchment', loose: [undefined, 'verse'], open: { chest: 'verse' }, floor: [60, 760, 'crystal'] },
  },
]; // prettier-ignore

function build(index: number): LevelSecrets {
  const definition = LEVELS[index]!;
  const level = definition.level;
  const secrets = { level, areas: {}, publicContainers: {}, publicLoose: {} } as LevelSecrets;
  for (const team of ['A', 'B'] as const) {
    const plan = PLAN[index]![team];
    const room = definition.rooms[team];
    const entrance = definition.fixtures.find(
      (entry) => entry.id === fixtureId(level, team, plan.entrance),
    );
    if (!entrance) throw new Error(`Level ${level}${team}: unknown entrance ${plan.entrance}.`);
    const template: AreaTemplate = TEMPLATES[plan.template];
    const id = `l${level}-${team.toLowerCase()}-hidden`;
    const fixtures = template.fixtures.map(([name, kind, x, y]) =>
      fixture(`${id}-${name}`, kind, x, y),
    );
    secrets.areas[team] = {
      id,
      levelId: level,
      team,
      parentRoomId: room.id,
      entranceObjectId: entrance.id,
      hint: HINTS[entrance.kind] ?? 'Something here is not what it seems…',
      name: template.name,
      columns: template.columns,
      rows: template.rows,
      spawn: template.spawn,
      // Wall-mounted and wall-side entrances all sit on the north wall: step back to the south.
      returnTo: { x: entrance.x + entrance.width / 2, y: entrance.y + entrance.height + 24 },
      fixtures,
      exitId: `${id}-exit`,
      containers: (['c1', 'c2'] as const)
        .filter((name) => fixtures.some((entry) => entry.id === `${id}-${name}`))
        .map((name) => ({ fixtureId: `${id}-${name}`, content: plan[name] })),
      loose: (plan.loose ?? []).flatMap((content, spot) =>
        content ? [{ point: template.loose[spot]!, content }] : [],
      ),
    };
    secrets.publicContainers[team] = Object.entries(plan.open).map(([name, content]) => ({
      fixtureId: fixtureId(level, team, name),
      content,
    }));
    const [x, y, kind] = plan.floor;
    secrets.publicLoose[team] = [
      { point: { x: room.bounds.x + x, y: room.bounds.y + y }, content: kind },
    ];
  }
  return secrets;
}

export const SECRETS: readonly LevelSecrets[] = PLAN.map((_, index) => build(index));
export const CONTAINER_KINDS: readonly FixtureKind[] = ['chest', 'cabinet', 'bookshelf'];
