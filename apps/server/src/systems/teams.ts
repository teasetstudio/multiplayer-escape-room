import { randomInt } from 'node:crypto';
import { TEAM_IDS, type LogicalMap, type PlayerState, type TeamId } from '@escape/shared';

function shuffle<T>(items: T[], pickIndex: (limit: number) => number) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = pickIndex(i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

/** Deal alternating seats from a Fisher–Yates shuffle. A temporarily offline lobby seat
 * also gets a permanent assignment, without skewing the balance of the connected group. */
export function assignTeams(
  players: Iterable<Pick<PlayerState, 'id' | 'connected'>>,
  pickIndex: (limit: number) => number = randomInt,
): Map<string, TeamId> {
  const online: string[] = [];
  const reserved: string[] = [];
  for (const player of players) (player.connected ? online : reserved).push(player.id);
  shuffle(online, pickIndex);
  shuffle(reserved, pickIndex);
  return new Map([...online, ...reserved].map((id, i) => [id, TEAM_IDS[i % TEAM_IDS.length]!]));
}

export function startingRoom(map: LogicalMap, teamId: TeamId) {
  const matches = map.rooms.filter((room) => room.startTeam === teamId);
  if (matches.length !== 1) throw new Error(`Team ${teamId} needs exactly one starting room.`);
  return matches[0]!;
}
