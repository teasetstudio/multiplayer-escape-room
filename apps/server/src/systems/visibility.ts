import { StateView, type Schema } from '@colyseus/schema';
import type { SessionStatus, TeamId } from '@escape/shared';
import type { GameState } from '../state/GameState.js';

export type Audience = 'host' | 'lobby' | TeamId | undefined;
export interface Viewer {
  audience: Audience;
  /** The hidden chamber this client's own character is in, if any. */
  area?: string;
}

export function canSeePlayer(
  audience: Audience,
  teamId: TeamId | undefined,
  status: SessionStatus = 'playing',
) {
  if (audience === 'host') return true;
  if (audience === 'lobby') return !teamId;
  // The Hall of Wisdom and the victory screen are one shared space for both teams.
  if (audience && (status === 'final' || status === 'won')) return !!teamId;
  return !!teamId && audience === teamId;
}

/** Only called at membership transitions. The schema encoder filters subsequent deltas.
 * This is the single authorization table for everything that is not public root state. */
export function syncVisibility(view: StateView, state: GameState, viewer: Viewer | Audience) {
  const { audience, area } =
    typeof viewer === 'object' ? viewer : { audience: viewer, area: undefined };
  function grant(object: Schema, allowed: boolean) {
    if (allowed && !view.has(object)) view.add(object);
    if (!allowed && view.has(object)) view.remove(object);
  }
  const team = audience === 'A' || audience === 'B' ? audience : undefined;
  const roomId = team && state.teams.get(team)?.roomId;
  const together = state.status === 'final' || state.status === 'won';
  for (const player of state.players.values())
    grant(player, canSeePlayer(audience, player.teamId, state.status));
  for (const entry of state.teams.values())
    grant(entry, audience === 'host' || audience === entry.id || (!!team && together));
  for (const door of state.doors.values())
    grant(door, audience === 'host' || (!!roomId && door.roomId === roomId));
  // Hidden chambers: positions go to players standing in the SAME chamber, never to the host.
  for (const explorer of state.explorers.values())
    grant(explorer, !!team && !!area && explorer.area === area);
  // Loose artifacts are private to the room's team so the big screen cannot give them away.
  for (const pickup of state.pickups.values()) grant(pickup, !!roomId && pickup.roomId === roomId);
  // Collected verse text is shared by all players; the host reads it only in the final stage.
  for (const card of state.cards.values()) grant(card, !!team || (audience === 'host' && together));
  for (const puzzle of state.puzzles.values()) grant(puzzle, !!team && puzzle.id === team);
}
